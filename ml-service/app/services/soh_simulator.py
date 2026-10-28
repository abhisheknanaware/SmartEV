"""What-if SOH simulator backed by the model trained in train_soh_simulator.py."""
import json
import os
from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
CHEMISTRIES = ("LFP", "NMC", "NCA", "LCO")


class SimulationInput(BaseModel):
    chemistry: str = Field("LFP", description="LFP | NMC | NCA | LCO")
    cycles: int = Field(500, ge=0, le=6000)
    ambient_temp_c: float = Field(25.0, ge=-10, le=60)
    charge_c_rate: float = Field(0.5, gt=0, le=10)
    discharge_c_rate: float = Field(1.0, gt=0, le=10)


class CurvePoint(BaseModel):
    cycle: int
    soh: float
    lo: float
    hi: float


class SimulationResult(BaseModel):
    soh: float
    soh_lo: float
    soh_hi: float
    status: str
    cycles_to_80: Optional[int]
    remaining_cycles_to_80: Optional[int]
    beyond_tested_range: bool
    warnings: List[str]
    curve: List[CurvePoint]
    model: dict


class SohSimulator:
    def __init__(self):
        self._bundle = None
        self._meta = None

    def _load(self):
        if self._bundle is None:
            self._bundle = joblib.load(os.path.join(MODEL_DIR, "soh_simulator.joblib"))
            with open(os.path.join(MODEL_DIR, "soh_simulator_metadata.json"), encoding="utf-8") as f:
                self._meta = json.load(f)
        return self._bundle, self._meta

    @property
    def ready(self) -> bool:
        try:
            self._load()
            return True
        except Exception:
            return False

    def _frame(self, inp: SimulationInput, cycles) -> pd.DataFrame:
        bundle, _ = self._load()
        rows = []
        for c in cycles:
            r = {f: 0.0 for f in bundle["features"]}
            r.update(cycle_number=float(c), ambient_temp_C=inp.ambient_temp_c,
                     max_charge_rate_C=inp.charge_c_rate, max_discharge_rate_C=inp.discharge_c_rate)
            r[f"chem_{inp.chemistry}"] = 1.0
            rows.append(r)
        return pd.DataFrame(rows)[bundle["features"]]

    def _band(self, cycle):
        bundle, _ = self._load()
        for b in bundle["band"]:
            if cycle <= b["max_cycle"]:
                return b["lo"], b["hi"]
        return bundle["band"][-1]["lo"], bundle["band"][-1]["hi"]

    def _warnings(self, inp: SimulationInput, horizon: int) -> List[str]:
        _, meta = self._load()
        s = meta["support"][inp.chemistry]
        w = []
        t = s["ambient_temp_C"]
        if inp.ambient_temp_c < min(t) - 2 or inp.ambient_temp_c > max(t) + 2:
            w.append(f"{inp.chemistry} cells were only tested at {min(t):g}–{max(t):g} °C; this temperature is an extrapolation.")
        span = lambda lo, hi: f"{lo:g}C" if lo == hi else f"{lo:g}–{hi:g}C"
        lo, hi = s["max_charge_rate_C"]
        if not (lo - 1e-9 <= inp.charge_c_rate <= hi + 1e-9):
            w.append(f"{inp.chemistry} cells were only charged at {span(lo, hi)} in the training data, so the charge-rate effect is not learned for this chemistry.")
        lo, hi = s["max_discharge_rate_C"]
        if not (lo - 1e-9 <= inp.discharge_c_rate <= hi + 1e-9):
            w.append(f"{inp.chemistry} cells were only discharged at {span(lo, hi)} in the training data.")
        if inp.cycles > s["max_cycles"]:
            w.append(f"The longest {inp.chemistry} test ran {s['max_cycles']:,} cycles; beyond that the curve is extrapolated.")
        if s["cells"] < 30:
            w.append(f"Only {s['cells']} {inp.chemistry} cells in the training data, so treat this as indicative.")
        return w

    def info(self) -> dict:
        _, meta = self._load()
        out = {k: meta[k] for k in ("created", "target", "features", "training", "evaluation", "support", "lightgbm")}
        bench = os.path.join(MODEL_DIR, "soh_model_benchmark.json")
        if os.path.exists(bench):  # written by benchmark_soh_models.py
            with open(bench, encoding="utf-8") as f:
                out["benchmark"] = json.load(f)
        return out

    def simulate(self, inp: SimulationInput) -> SimulationResult:
        inp.chemistry = inp.chemistry.upper()
        if inp.chemistry not in CHEMISTRIES:
            raise ValueError(f"chemistry must be one of {', '.join(CHEMISTRIES)}")
        bundle, meta = self._load()
        model = bundle["model"]
        tested_max = meta["support"][inp.chemistry]["max_cycles"]
        horizon = int(max(inp.cycles * 2, min(tested_max, 3000), 400))
        grid = np.unique(np.linspace(0, horizon, 41).round().astype(int).tolist() + [inp.cycles])
        pred = np.clip(model.predict(self._frame(inp, grid)), 0, 100)
        pred = np.minimum.accumulate(pred)  # guard: SOH never rises with cycling

        curve = []
        for c, p in zip(grid, pred):
            lo, hi = self._band(c)
            curve.append(CurvePoint(cycle=int(c), soh=round(float(p), 2),
                                    lo=round(float(np.clip(p + lo, 0, 100)), 2), hi=round(float(np.clip(p + hi, 0, 100)), 2)))
        now = next(pt for pt in curve if pt.cycle == inp.cycles)
        below = [pt.cycle for pt in curve if pt.soh < 80.0]
        cycles_to_80 = int(below[0]) if below else None
        remaining = None if cycles_to_80 is None else max(0, cycles_to_80 - inp.cycles)
        status = "EXCELLENT" if now.soh >= 90 else "GOOD" if now.soh >= 80 else "MODERATE" if now.soh >= 70 else "END OF LIFE"
        ev = meta["evaluation"]["model"]
        return SimulationResult(
            soh=now.soh, soh_lo=now.lo, soh_hi=now.hi, status=status,
            cycles_to_80=cycles_to_80, remaining_cycles_to_80=remaining,
            beyond_tested_range=inp.cycles > tested_max,
            warnings=self._warnings(inp, horizon), curve=curve,
            model={
                "name": "LightGBM SOH simulator (monotone in cycles)",
                "trained_on": f"{meta['training']['cells']} laboratory cells, {meta['training']['rows']:,} cycles",
                "sources": meta["training"]["cells_by_source"],
                "heldout_rmse_pct": round(ev["rmse"], 2),
                "heldout_mae_pct": round(ev["mae"], 2),
                "heldout_r2": round(ev["r2"], 3),
                "band": "10th–90th percentile of errors on held-out cells",
                "created": meta["created"],
            },
        )


soh_simulator = SohSimulator()
