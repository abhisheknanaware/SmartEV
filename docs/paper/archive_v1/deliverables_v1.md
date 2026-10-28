# Paper Deliverables: Readiness, Contributions, Figures, Reproducibility, Integrity Audit

Companion to `SmartEV_partial_charging_SOH_paper.md`. All numbers trace to files listed in Section E.

---

## A. Research-readiness assessment

| Area | Status | Evidence |
|---|---|---|
| Literature foundation | Usable after corrections | `verified_literature_survey_and_gap_analysis.md`; DOIs re-verified via Crossref/arXiv (Section F) |
| P7 DOI dispute | **Resolved** | Article PDF and Crossref give `10.1016/j.ins.2023.01.100`; `10.1016/j.ins.2023.03.111` is an unrelated paper (Wu *et al.*, "Dynamic multi-objective evolutionary algorithm based on knowledge transfer", Inf. Sci. 636) |
| Survey page ranges | Two corrected | P1: pp. 165419–165431 (survey: 165432); P4: pp. 125176–125187 (survey: 125183) |
| Survey metrics | Spot-checked | P1, P2, P5, P7 values found in PDFs; P3 "0.0032" and B54 found; P4 values not found in PDF text, marked "not re-verified" |
| Datasets | Verified on disk | 362 harmonized cells / 400,224 cycles (`datasets/master/cells.parquet`, `cycles.parquet`); 361 cells / 81,073 partial sessions used |
| Fleet data | **Not available** | `ev_battery_health.csv` not found; no field SOH labels exist |
| Experiments | Executed (CPU) | `datasets/experiments/partial_charge_soh/results/` |
| Paper type supported | **Experimental study of a focused question** (SOH from arbitrary partial sessions + calibrated intervals). Not supported: UDE forecasting, KAN, survival, anomaly, MPC claims. | |

## B. Research question, contributions, hypotheses

**Research question.** How accurately, and with what calibrated uncertainty, can SOH be estimated from one partial charging
session of arbitrary start and length under cell- and dataset-separated evaluation, and does self-supervised pre-training
help?

| Contribution | Hypothesis | Experiment | Evidence needed |
|---|---|---|---|
| C1 Leakage-controlled multi-source partial-session benchmark | — (resource) | Build sessions from 6 datasets with observable-only inputs | Dataset statistics; leakage controls |
| C2 Comparison of representations (hand features, raw curves, supervised and SSL encoders) | H1: learned encoder beats handcrafted baselines; H2: SSL helps most at 10 % labels | `main` experiment, 3 seeds × {100 %, 10 %} | Table V, Fig. 10 |
| C3 Measured CQR calibration on unseen cells and datasets | H3: ≈ 90 % coverage on unseen cells of seen datasets, possibly lower on unseen datasets | `main` + `xdata` | Figs. 9, 11; Table VI |

## C. Paper

See `SmartEV_partial_charging_SOH_paper.md`.

## D. Figure inventory

[FILLED AFTER RESULTS]

## E. Reproducibility checklist

| Item | Location / value |
|---|---|
| Raw data | `Ai ev/datasets/raw/` (NASA, Oxford, VED from official hosts; CALCE, SNL, HUST, MATR from BatteryLife Zenodo record 19688272); MD5 checks passed for Zenodo files |
| Extraction | `ml-service/training/data_acquisition/extract.py` (path-traversal checks); `safe_pickle.py` (restricted unpickler) |
| Harmonization + labels | `build_master.py` (Hampel window 21, 3 MAD, floor 0.5 % SOH; EOL 0.80; `--relabel`) |
| Features (not used in this paper's models) | `build_features.py` |
| Partial sessions | `experiments/partial_charge_soh/make_windows.py`, seed 20261012, 120 cycles/cell, 2 sessions/cycle, s ~ U(0.05, 0.60), w ~ U(0.15, 0.40) |
| Experiments | `experiments/partial_charge_soh/run_experiments.py main` and `... xdata`; seeds 0, 1, 2 (split seeds r, r+1, r+2) |
| Configuration | `results/config.json` (epochs 25, patience 5, batch 512, lr 2e-3, wd 1e-4, SSL 10 epochs, mask 30 %, α = 0.1) |
| Outputs | `results/metrics_{main,xdata}.csv`, `predictions_{main,xdata}.csv`, `train_log_{main,xdata}.json` |
| Figures / tables | `docs/paper/make_diagrams.py`, `docs/paper/make_results_figures.py` → `docs/paper/figures/`, `docs/paper/tables/` |
| Software | Python 3.13.9, PyTorch 2.11.0 (CPU), LightGBM 4.6.0, scikit-learn 1.7.2, NumPy 2.3.5, pandas 2.3.3, SciPy 1.16.3 |
| Hardware | Windows 11, 24 logical cores, 15.6 GB RAM, 16 torch threads |
| Not fixed by seed | Thread-level non-determinism in PyTorch CPU kernels and LightGBM may cause small run-to-run differences |

## F. Scientific-integrity audit

[FILLED AFTER RESULTS]
