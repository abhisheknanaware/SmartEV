"""Artifact saving for run_experiments.py: checkpoints, calibration artifacts, split manifests, checkpoint manifest.

Formats (safe, framework-native):
  Ridge     ridge.json (coefficients, intercept, scaler mean/scale) + model.joblib (scaler + estimator)
  LightGBM  booster_{lo,mid,hi}.txt (LightGBM text model format)
  CNN       model_state.pt (state_dict only; load with torch.load(..., weights_only=True)), arch.json, prep.json
  SSL       ssl_encoder_state.pt (pre-trained encoders before fine-tuning), one per split
  Every run meta.json (configuration, features, shapes, seed, split, labelled cells, versions, metrics) and calibration.npz
"""
import hashlib
import json
import platform
import time
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import sklearn
import torch

VERSIONS = {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__, "torch": torch.__version__,
            "lightgbm": lgb.__version__, "scikit-learn": sklearn.__version__}


def sha256(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(chunk), b""):
            h.update(b)
    return h.hexdigest()


def run_id(exp, seed, frac, holdout, model):
    return f"{exp}_seed{seed}_frac{frac}_{holdout or 'none'}_{model}"


def write_split_manifest(data, splits, path):
    """splits: list of (seed, holdout, split_dict). Writes one row per (seed, holdout, cell)."""
    rows = []
    for seed, holdout, sp in splits:
        for part, ix in sp.items():
            cells = pd.DataFrame({"cell_id": data.cell[ix], "source": data.source[ix]}).drop_duplicates()
            for c in cells.itertuples(index=False):
                rows.append({"seed": seed, "holdout": holdout or "", "cell_id": c.cell_id, "source": c.source,
                             "partition": part, "n_sessions": int((data.cell[ix] == c.cell_id).sum())})
    df = pd.DataFrame(rows).sort_values(["holdout", "seed", "partition", "cell_id"])
    df.to_csv(path, index=False)
    return df


def save_run(out_dir, rid, model, store, meta, calib, feature_names):
    d = Path(out_dir) / "checkpoints" / rid
    d.mkdir(parents=True, exist_ok=True)
    files = []
    if model == "ridge":
        sc, m = store["scaler"], store["model"]
        joblib.dump({"scaler": sc, "model": m}, d / "model.joblib")
        (d / "ridge.json").write_text(json.dumps({"coef": m.coef_.tolist(), "intercept": float(m.intercept_),
                                                  "scaler_mean": sc.mean_.tolist(), "scaler_scale": sc.scale_.tolist(),
                                                  "alpha": m.alpha, "nan_policy": "nan_to_num before scaling"}, indent=1))
        files += ["model.joblib", "ridge.json"]
    elif model.startswith("lgbm"):
        for name, m in store["models"].items():
            m.booster_.save_model(str(d / f"booster_{name}.txt"))
            files.append(f"booster_{name}.txt")
    else:
        torch.save(store["net"].state_dict(), d / "model_state.pt")
        (d / "arch.json").write_text(json.dumps(store["arch"], indent=1))
        (d / "prep.json").write_text(json.dumps(store["prep"], indent=1))
        files += ["model_state.pt", "arch.json", "prep.json"]
        if store.get("ssl_state") is not None:
            torch.save(store["ssl_state"], d / "ssl_encoder_state.pt")
            files.append("ssl_encoder_state.pt")
    np.savez_compressed(d / "calibration.npz", **calib)
    files.append("calibration.npz")
    meta = {**meta, "feature_names": feature_names, "files": files, "versions": VERSIONS,
            "created": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    (d / "meta.json").write_text(json.dumps(meta, indent=1, default=str))
    return d, {f: sha256(d / f) for f in files}
