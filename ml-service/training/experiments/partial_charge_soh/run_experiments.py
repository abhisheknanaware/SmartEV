"""SOH estimation from arbitrary partial charging windows: baselines, supervised CNN, self-supervised CNN, CQR.

Experiments (all cell-separated; no cell appears in more than one of train / calibration / test):
  main   : 3 seeds x label fractions {0.1, 1.0}; models ridge, lgbm_hand, lgbm_all, cnn_sup, cnn_ssl
  xdata  : leave-one-source-out for MATR, HUST, SNL (seed 0, full labels)

Outputs (OUT_DIR): predictions_<exp>.csv, metrics_<exp>.csv, train_log_<exp>.json, config.json,
  splits_<exp>.csv (cell -> partition per seed/holdout), checkpoints/<run_id>/ (model, preprocessing, meta, calibration),
  checkpoint_manifest_<exp>.csv

CNNs run on CUDA when available (override with SOH_DEVICE=cpu); ridge and LightGBM run on CPU.

Usage: python -I run_experiments.py WINDOWS_NPZ OUT_DIR {main|xdata|xdata3}
"""
import json
import os
import sys
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler

torch.set_num_threads(16)
DEVICE = torch.device(os.environ.get("SOH_DEVICE", "cuda" if torch.cuda.is_available() else "cpu"))
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False
ALPHA = 0.10                    # target miscoverage -> 90 % prediction intervals
QUANTILES = (ALPHA / 2, 0.5, 1 - ALPHA / 2)
CFG = dict(epochs=25, patience=5, batch=512, lr=2e-3, weight_decay=1e-4, ssl_epochs=10, ssl_mask_frac=0.3,
           test_frac=0.20, calib_frac=0.15, val_frac=0.15, alpha=ALPHA)


# ----------------------------------------------------------------------------- data
class Data:
    def __init__(self, path):
        d = np.load(path, allow_pickle=False)
        self.y = d["y"].astype(np.float32)
        self.cell, self.source, self.chem = d["cell"], d["source"], d["chem"]
        self.s, self.w = d["s"], d["w"]
        self.hand = np.hstack([d["hand"], d["ctx"]]).astype(np.float32)
        self.hand_names = [str(n) for n in d["hand_names"]] + [str(n) for n in d["ctx_names"]]
        self.path = str(path)
        self.ctx = d["ctx"].astype(np.float32)
        self.xa = d["xa"].astype(np.float32)   # charge-domain view: V at fixed accumulated-charge steps
        self.xv = d["x"].astype(np.float32)    # voltage-domain view: accumulated charge at fixed voltages


def split_cells(data, seed, exclude_source=None):
    """Cell-level split stratified by source: train / validation / calibration / test indices."""
    idx = {k: [] for k in ("train", "val", "calib", "test")}
    for src in np.unique(data.source):
        rows = np.where(data.source == src)[0]
        if exclude_source is not None:
            key = "test" if src == exclude_source else None
            if key:
                idx["test"].append(rows)
                continue
        g = data.cell[rows]
        if exclude_source is None:
            dev, te = next(GroupShuffleSplit(1, test_size=CFG["test_frac"], random_state=seed).split(rows, groups=g))
            idx["test"].append(rows[te])
            rows, g = rows[dev], g[dev]
        rest, cal = next(GroupShuffleSplit(1, test_size=CFG["calib_frac"], random_state=seed + 1).split(rows, groups=g))
        idx["calib"].append(rows[cal])
        rows, g = rows[rest], g[rest]
        tr, va = next(GroupShuffleSplit(1, test_size=CFG["val_frac"], random_state=seed + 2).split(rows, groups=g))
        idx["train"].append(rows[tr])
        idx["val"].append(rows[va])
    return {k: np.concatenate(v) for k, v in idx.items()}


def label_subset(data, train_idx, frac, seed):
    if frac >= 1.0:
        return train_idx
    cells = np.unique(data.cell[train_idx])
    keep = np.random.default_rng(seed).choice(cells, max(2, int(round(frac * len(cells)))), replace=False)
    return train_idx[np.isin(data.cell[train_idx], keep)]


# ----------------------------------------------------------------------------- conformal
def cqr(lo_cal, hi_cal, y_cal, lo, hi, alpha=ALPHA):
    """Split conformalized quantile regression (Romano et al., 2019)."""
    scores = np.maximum(lo_cal - y_cal, y_cal - hi_cal)
    n = len(scores)
    q = np.quantile(scores, min(1.0, np.ceil((n + 1) * (1 - alpha)) / n), method="higher")
    return lo - q, hi + q, float(q)


# ----------------------------------------------------------------------------- tree / linear models
def fit_ridge(data, tr, te_sets, store=None):
    sc = StandardScaler().fit(np.nan_to_num(data.hand[tr]))
    m = Ridge(alpha=1.0).fit(sc.transform(np.nan_to_num(data.hand[tr])), data.y[tr])
    if store is not None:
        store.update(scaler=sc, model=m)
    return {k: (m.predict(sc.transform(np.nan_to_num(data.hand[ix]))), None, None) for k, ix in te_sets.items()}


def fit_lgbm(X, data, tr, va, te_sets, seed, store=None):
    out, models = {}, {}
    for name, q in zip(("lo", "mid", "hi"), QUANTILES):
        params = dict(objective="quantile", alpha=q) if name != "mid" else dict(objective="regression")
        m = lgb.LGBMRegressor(n_estimators=2000, learning_rate=0.03, num_leaves=31, min_child_samples=40,
                              subsample=0.8, subsample_freq=1, colsample_bytree=0.8, random_state=seed, verbose=-1, **params)
        m.fit(X[tr], data.y[tr], eval_set=[(X[va], data.y[va])], callbacks=[lgb.early_stopping(100, verbose=False)])
        models[name] = m
    if store is not None:
        store["models"] = models
    for k, ix in te_sets.items():
        out[k] = (models["mid"].predict(X[ix]), models["lo"].predict(X[ix]), models["hi"].predict(X[ix]))
    return out


# ----------------------------------------------------------------------------- neural model
class Branch(nn.Module):
    """Fully convolutional encoder over one curve view (channels: value, observed mask, hidden flag)."""

    def __init__(self, ch=48):
        super().__init__()
        self.convs = nn.ModuleList([nn.Conv1d(3, ch, 5, padding=2), nn.Conv1d(ch, ch, 5, padding=4, dilation=2),
                                    nn.Conv1d(ch, ch, 5, padding=8, dilation=4)])
        self.norms = nn.ModuleList([nn.BatchNorm1d(ch) for _ in range(3)])
        self.recon = nn.Conv1d(ch, 1, 1)

    def features(self, x):
        h = x
        for conv, norm in zip(self.convs, self.norms):
            h = F.gelu(norm(conv(h))) + (h if h.shape[1] == conv.out_channels else 0)
        return h

    def pooled(self, x):
        h = self.features(x)
        m = x[:, 1:2]
        mean = (h * m).sum(-1) / m.sum(-1).clamp(min=1)
        mx = (h + (m - 1) * 1e4).amax(-1)
        return torch.cat([mean, mx], 1)


class PartialCurveNet(nn.Module):
    def __init__(self, n_ctx, ch=48):
        super().__init__()
        self.ba, self.bv = Branch(ch), Branch(ch)
        self.head = nn.Sequential(nn.Linear(4 * ch + n_ctx, 128), nn.GELU(), nn.Dropout(0.1), nn.Linear(128, 3))

    def forward(self, xa, xv, ctx):
        z = torch.cat([self.ba.pooled(xa), self.bv.pooled(xv), ctx], 1)
        o = self.head(z)
        mid = o[:, 1]
        return mid - F.softplus(o[:, 0]), mid, mid + F.softplus(o[:, 2])


def pinball(pred, y, q):
    d = y - pred
    return torch.maximum(q * d, (q - 1) * d).mean()


class Prep:
    """Standardise observed curve values with training statistics; add the hidden-flag channel."""

    def __init__(self, data, tr):
        self.stats = {}
        for name in ("xa", "xv"):
            x = getattr(data, name)[tr]
            vals = x[:, 0][x[:, 1] > 0]
            self.stats[name] = (float(vals.mean()), float(vals.std() + 1e-6))

    def tensor(self, data, ix, name):
        x = getattr(data, name)[ix].copy()
        mu, sd = self.stats[name]
        x[:, 0] = np.where(x[:, 1] > 0, (x[:, 0] - mu) / sd, 0.0)
        return torch.from_numpy(np.concatenate([x, np.zeros_like(x[:, :1])], 1))


def take(t, ix):
    """Index a (possibly CUDA) tensor with a NumPy index array."""
    return t[torch.as_tensor(ix, device=t.device)]


def batches(n, bs, rng):
    order = rng.permutation(n)
    for i in range(0, n, bs):
        yield order[i:i + bs]


def hide(x, frac, rng):
    """Mask one contiguous block covering ~frac of each observed window (windows are contiguous)."""
    x = x.clone()
    obs = x[:, 1] > 0
    n = obs.sum(1)
    first = obs.float().argmax(1)
    k = (n.float() * frac).round().clamp(min=1).long()
    start = first + (torch.from_numpy(rng.random(len(n))).float().to(x.device) * (n - k + 1).float()).floor().long()
    pos = torch.arange(x.shape[-1], device=x.device).unsqueeze(0)
    hidden = (pos >= start[:, None]) & (pos < (start + k)[:, None]) & (n >= 4)[:, None]
    x[:, 0][hidden] = 0.0
    x[:, 1][hidden] = 0.0
    x[:, 2][hidden] = 1.0
    return x, hidden


def pretrain_ssl(net, xa, xv, epochs, seed, log):
    rng = np.random.default_rng(seed)
    params = list(net.ba.parameters()) + list(net.bv.parameters())
    opt = torch.optim.AdamW(params, lr=CFG["lr"], weight_decay=CFG["weight_decay"])
    for ep in range(epochs):
        net.train()
        tot = 0.0
        for b in batches(len(xa), CFG["batch"], rng):
            loss = 0.0
            for branch, x in ((net.ba, take(xa, b)), (net.bv, take(xv, b))):
                xin, hidden = hide(x, CFG["ssl_mask_frac"], rng)
                rec = branch.recon(branch.features(xin))[:, 0]
                loss = loss + F.mse_loss(rec[hidden], x[:, 0][hidden]) if hidden.any() else loss
            opt.zero_grad()
            loss.backward()
            opt.step()
            tot += loss.item() * len(b)
        log.append({"phase": "ssl", "epoch": ep + 1, "train_loss": tot / len(xa)})


def train_supervised(net, T, tr, va, seed, log, tag):
    rng = np.random.default_rng(seed)
    opt = torch.optim.AdamW(net.parameters(), lr=CFG["lr"], weight_decay=CFG["weight_decay"])
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, CFG["epochs"])
    best, best_state, bad = np.inf, None, 0
    qs = torch.tensor(QUANTILES, device=T["y"].device)
    for ep in range(CFG["epochs"]):
        net.train()
        tot = 0.0
        for b in batches(len(tr), CFG["batch"], rng):
            i = tr[b]
            lo, mid, hi = net(take(T["xa"], i), take(T["xv"], i), take(T["ctx"], i))
            y = take(T["y"], i)
            loss = pinball(lo, y, qs[0]) + pinball(mid, y, qs[1]) + pinball(hi, y, qs[2])
            opt.zero_grad()
            loss.backward()
            opt.step()
            tot += loss.item() * len(i)
        sched.step()
        val = rmse(predict(net, T, va)[0], take(T["y"], va).cpu().numpy())
        log.append({"phase": tag, "epoch": ep + 1, "train_loss": tot / len(tr), "val_rmse": val})
        if val < best - 1e-5:
            best, best_state, bad = val, {k: v.clone() for k, v in net.state_dict().items()}, 0
            net.best_epoch, net.best_val_rmse = ep + 1, val
        else:
            bad += 1
            if bad >= CFG["patience"]:
                break
    net.load_state_dict(best_state)


@torch.no_grad()
def predict(net, T, ix):
    net.eval()
    outs = [net(take(T["xa"], ix[i:i + 4096]), take(T["xv"], ix[i:i + 4096]), take(T["ctx"], ix[i:i + 4096]))
            for i in range(0, len(ix), 4096)]
    lo, mid, hi = (torch.cat([o[k] for o in outs]).cpu().numpy() for k in range(3))
    return mid, lo, hi


_SSL_CACHE = {}


def fit_cnn(data, split, tr_lab, te_sets, seed, ssl, log, store=None):
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    prep = Prep(data, split["train"])
    all_ix = np.arange(len(data.y))
    T = {"xa": prep.tensor(data, all_ix, "xa"), "xv": prep.tensor(data, all_ix, "xv"),
         "ctx": torch.from_numpy(data.ctx), "y": torch.from_numpy(data.y)}
    T = {k: v.to(DEVICE) for k, v in T.items()}
    net = PartialCurveNet(data.ctx.shape[1]).to(DEVICE)
    tag = "cnn_ssl" if ssl else "cnn_sup"
    key = (seed, len(split["train"]), int(split["train"].sum()))
    if ssl:  # self-supervised on ALL training-cell windows (no SOH labels used); cached per split
        if key not in _SSL_CACHE:
            tr_all = split["train"]
            pretrain_ssl(net, take(T["xa"], tr_all), take(T["xv"], tr_all), CFG["ssl_epochs"], seed, log)
            _SSL_CACHE[key] = {k: v.detach().clone() for k, v in net.state_dict().items()}
        else:
            net.load_state_dict(_SSL_CACHE[key])
    train_supervised(net, T, tr_lab, split["val"], seed, log, tag)
    if store is not None:
        store.update(net=net, prep={k: list(v) for k, v in prep.stats.items()},
                     ssl_state={k: v.cpu() for k, v in _SSL_CACHE[key].items()} if ssl else None,
                     training={"best_epoch": getattr(net, "best_epoch", None), "best_val_rmse": getattr(net, "best_val_rmse", None),
                               "device": str(DEVICE)},
                     arch={"class": "PartialCurveNet", "channels": 48, "n_ctx": int(data.ctx.shape[1]),
                           "views": {"xa": [3, int(data.xa.shape[2])], "xv": [3, int(data.xv.shape[2])]},
                           "input_channels": ["value standardized with prep.json (0 where unobserved)", "observed mask",
                                              "hidden flag (0 at inference)"],
                           "quantiles": list(QUANTILES), "ssl_pretrained": bool(ssl)})
    return {k: predict(net, T, ix) for k, ix in te_sets.items()}


# ----------------------------------------------------------------------------- metrics
def rmse(p, y):
    return float(np.sqrt(np.mean((p - y) ** 2)))


def evaluate(data, ix, mid, lo, hi):
    y = data.y[ix]
    e = mid - y
    r = {"rmse_pct": rmse(mid, y) * 100, "mae_pct": float(np.mean(np.abs(e))) * 100,
         "r2": float(1 - np.sum(e ** 2) / np.sum((y - y.mean()) ** 2)), "n": int(len(ix)), "n_cells": int(len(np.unique(data.cell[ix])))}
    if lo is not None:
        r["coverage"] = float(np.mean((y >= lo) & (y <= hi)))
        r["width_pct"] = float(np.mean(hi - lo)) * 100
    return r


def run(data, exp, out_dir, models_only=None, plan_only=None):
    sys.path.insert(0, str(Path(__file__).parent))
    import artifacts as A
    rows, preds, log, manifest = [], [], [], []
    if exp == "main":
        plan = [(seed, frac, None) for seed in (0, 1, 2) for frac in (1.0, 0.1)]
        models = ["ridge", "lgbm_hand", "lgbm_all", "cnn_sup", "cnn_ssl"]
    elif exp == "xdata":
        plan = [(0, 1.0, src) for src in ("MATR", "HUST", "SNL")]
        models = ["lgbm_hand", "cnn_sup", "cnn_ssl"]
    else:  # "xdata3": supplementary robustness, same protocol with seeds 0-2 (seed 0 = primary xdata result)
        plan = [(seed, 1.0, src) for seed in (0, 1, 2) for src in ("MATR", "HUST", "SNL")]
        models = ["lgbm_hand", "cnn_sup", "cnn_ssl"]
    plan = plan_only or plan
    models = models_only or models
    windows_sha = A.sha256(data.path)
    A.write_split_manifest(data, [(s, h, split_cells(data, s, h)) for s, h in sorted({(p[0], p[2]) for p in plan}, key=str)],
                           out_dir / f"splits_{exp}.csv")
    curve_names = [f"xa_{c}_{j}" for c in ("value", "mask") for j in range(data.xa.shape[2])] + \
                  [f"xv_{c}_{j}" for c in ("value", "mask") for j in range(data.xv.shape[2])]
    X_all = np.hstack([data.hand, data.xa.reshape(len(data.y), -1), data.xv.reshape(len(data.y), -1)])
    for seed, frac, holdout in plan:
        split = split_cells(data, seed, holdout)
        tr_lab = label_subset(data, split["train"], frac, seed)
        sets = {"val": split["val"], "calib": split["calib"], "test": split["test"]}
        for model in models:
            t0 = time.time()
            mlog, store = [], {}
            if model == "ridge":
                res = fit_ridge(data, tr_lab, sets, store)
            elif model == "lgbm_hand":
                res = fit_lgbm(data.hand, data, tr_lab, split["val"], sets, seed, store)
            elif model == "lgbm_all":
                res = fit_lgbm(X_all, data, tr_lab, split["val"], sets, seed, store)
            else:
                res = fit_cnn(data, split, tr_lab, sets, seed, model == "cnn_ssl", mlog, store)
            mid, lo_raw, hi_raw = res["test"]
            lo, hi = lo_raw, hi_raw
            conf, calib = {}, {"test_rows": split["test"], "test_mid": mid}
            if lo_raw is not None:
                cm, cl, ch = res["calib"]
                y_cal = data.y[split["calib"]]
                lo, hi, qhat = cqr(cl, ch, y_cal, lo_raw, hi_raw)
                conf["cqr_qhat_pct"] = qhat * 100
                calib.update(calib_rows=split["calib"], calib_y=y_cal, calib_mid=cm, calib_lo_raw=cl, calib_hi_raw=ch,
                             calib_scores=np.maximum(cl - y_cal, y_cal - ch), qhat=np.float64(qhat), alpha=np.float64(ALPHA),
                             quantiles=np.array(QUANTILES), test_lo_raw=lo_raw, test_hi_raw=hi_raw, test_lo=lo, test_hi=hi)
            metrics = evaluate(data, split["test"], mid, lo, hi)
            val_metrics = evaluate(data, split["val"], res["val"][0], None, None)
            base = dict(exp=exp, seed=seed, label_frac=frac, holdout=holdout or "", model=model,
                        n_train_cells=int(len(np.unique(data.cell[tr_lab]))), seconds=round(time.time() - t0, 1))
            rows.append({**base, "scope": "all", **metrics, **conf, "val_rmse_pct": val_metrics["rmse_pct"]})
            rid = A.run_id(exp, seed, frac, holdout, model)
            feats = data.hand_names if model in ("ridge", "lgbm_hand") else (data.hand_names + curve_names if model == "lgbm_all" else
                                                                              ["xa (3x48)", "xv (3x64)"] + data.hand_names[-8:])
            meta = {"run_id": rid, **base, "windows_npz": data.path, "windows_sha256": windows_sha, "split_manifest": f"splits_{exp}.csv",
                    "labelled_train_cells": sorted(np.unique(data.cell[tr_lab]).tolist()), "config": CFG,
                    "test_metrics": metrics, "val_metrics": val_metrics, **conf, "training": store.get("training"),
                    "data_note": "sessions are crops of measured laboratory full-charge curves (64-point resampled), not field plug-in events"}
            ck_dir, hashes = A.save_run(out_dir, rid, model, store, meta, calib, feats)
            manifest.append({"run_id": rid, **base, "path": str(ck_dir.relative_to(out_dir)), "files": ";".join(hashes),
                             "sha256": ";".join(hashes.values()), "test_rmse_pct": metrics["rmse_pct"], "val_rmse_pct": val_metrics["rmse_pct"],
                             "coverage": metrics.get("coverage"), "cqr_qhat_pct": conf.get("cqr_qhat_pct")})
            pd.DataFrame(manifest).to_csv(out_dir / f"checkpoint_manifest_{exp}.csv", index=False)
            for src in np.unique(data.source[split["test"]]):
                m = data.source[split["test"]] == src
                rows.append({**base, "scope": src, **evaluate(data, split["test"][m], mid[m], None if lo is None else lo[m],
                                                               None if hi is None else hi[m])})
            preds.append(pd.DataFrame({**{k: v for k, v in base.items() if k != "seconds"}, "row": split["test"],
                                       "cell": data.cell[split["test"]], "source": data.source[split["test"]],
                                       "y": data.y[split["test"]], "pred": mid, "lo": lo, "hi": hi,
                                       "s": data.s[split["test"]], "w": data.w[split["test"]]}))
            for e in mlog:
                log.append({**{k: v for k, v in base.items() if k != "seconds"}, **e})
            print(f"[{exp}] seed={seed} frac={frac} holdout={holdout or '-'} {model:<9} "
                  f"RMSE={metrics['rmse_pct']:.2f}% cov={metrics.get('coverage', float('nan')):.3f} ({time.time() - t0:.0f}s)", flush=True)
            pd.DataFrame(rows).to_csv(out_dir / f"metrics_{exp}.csv", index=False)
    pd.concat(preds).to_csv(out_dir / f"predictions_{exp}.csv", index=False)
    (out_dir / f"train_log_{exp}.json").write_text(json.dumps(log))
    (out_dir / "config.json").write_text(json.dumps({**CFG, "quantiles": QUANTILES, "torch": torch.__version__,
                                                     "lightgbm": lgb.__version__, "cnn_device": str(DEVICE),
                                                     "gpu": torch.cuda.get_device_name(0) if DEVICE.type == "cuda" else None},
                                                    indent=2))
    print(f"{exp.upper()} DONE", flush=True)


if __name__ == "__main__":
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    smoke = os.environ.get("SOH_SMOKE") == "1"
    if smoke:  # tiny run to verify artifact saving and reload, not used for results
        CFG.update(epochs=2, ssl_epochs=1, patience=2)
        run(Data(sys.argv[1]), sys.argv[3], out, plan_only=[(0, 0.1, None)])
    else:
        run(Data(sys.argv[1]), sys.argv[3], out)
