# Final Verification Report: Partial-Charging SOH Experiment and Paper

Date: 2026-10-14. Scope: the six-dataset, 361-cell, 81,073-session benchmark (unchanged methodology and split protocol).

Paths: `E` = `ml-service/training/experiments/partial_charge_soh/`, `W` = `Ai ev/datasets/experiments/partial_charge_soh/`, `P` = `docs/paper/`.

## 1. Status of every deliverable

| # | Deliverable | Status | Paths | Evidence |
|---|---|---|---|---|
| 1 | Validate existing (v1) results | **Completed and verified** | `E/verify_existing.py`; `W/results/verification_existing.md` | Metrics recomputed from predictions (1,386 + 126 values, max diff 1.1e-5); test cells match `split_cells(seed)`; no overlap; held-out sources excluded |
| 2 | v1 model weights | **Blocked (not recoverable)** | — | v1 never saved weights. Not claimed as recovered; v1 numbers are not reported |
| 3 | Checkpoints for Ridge, LightGBM, supervised CNN, SSL encoder, fine-tuned SSL CNN | **Completed and verified** | `E/artifacts.py`; `W/results_v2/checkpoints/` (66 runs) | `verify_checkpoints.py` reloads each run and re-predicts: 66/66 pass, max diff ≤ 4.4e-16 |
| 4 | Checkpoint metadata and manifest | **Completed and verified** | `meta.json` per run; `W/results_v2/checkpoint_manifest_{main,xdata,xdata3}.csv` | SHA-256 per file checked by the verifier |
| 5 | Explicit split manifests | **Completed and verified** | `W/results_v2/splits_{main,xdata,xdata3}.csv` | Calibration cells are disjoint from test cells in every run (verifier) |
| 6 | CQR calibration artifacts | **Completed and verified** | `calibration.npz` per run | q̂ recomputed from saved scores; intervals = raw ∓ q̂; coverage and width match the metrics |
| 7 | Smoke test before rerun | **Completed and verified** | `SOH_SMOKE=1` mode in `E/run_experiments.py` | Reloaded all 5 model types; predictions matched to 2e-16 |
| 8 | Rerun (v2, CNNs on RTX 5060 GPU) | **Completed and verified** | `W/results_v2/metrics_*.csv`, `predictions_*.csv`, `train_log_*.json`, `config.json` | Ridge/LightGBM bit-identical to v1 (21/21); CNN main max ΔRMSE 0.20 pp |
| 9 | v1 vs v2 differences recorded | **Completed and verified** | `E/compare_versions.py`; `W/results_v2/comparison_v1_v2.md` | Per-run table; CNN cross-dataset differs by up to 1.37 pp (CPU→GPU) |
| 10 | Three-seed cross-dataset robustness (supplementary) | **Completed and verified** | `W/results_v2/metrics_xdata3.csv`; Table VIII | 27 runs verified; seed 0 identical to `xdata` (max diff 0.0), so GPU training is deterministic |
| 11 | Data / curve interpretation check | **Completed and verified** | `windows.npz` regeneration; paper Sec. III | Regenerated `windows.npz` matches all 17 arrays. Sessions are documented as crops of measured lab full-charge curves, not field plug-in events |
| 12 | NASA_B0045 exclusion | **Completed and verified (paper corrected)** | `datasets/master/cycles.parquet`; paper Sec. III-B | Max clean-cycle SOH 0.443 < 0.5 (0.541 is a flagged outlier); 71/72 charge curves valid. The old "no valid charge curve" text was wrong and has been replaced |
| 13 | Research environment file | **Completed but not independently verified** | `ml-service/training/requirements-research.txt` | Versions are the installed ones. A clean-environment install was **not** tested |
| 14 | Final tables | **Completed and verified** | `P/tables/` | Regenerated from `results_v2` by `make_results_figures.py` and filled into the paper by `build_ieee.py` |
| 15 | Final figures (14 in paper + methodology flowchart) | **Completed and verified** | `P/figures/`; inventory in `P/deliverables.md` §D | Result figures regenerated from `results_v2`; new per-dataset RMSE and residual figures; v1 figures in `P/archive_v1/` |
| 16 | Paper, all formats consistent | **Completed and verified** | `P/ieee/paper_ieee_source.md` → `SmartEV_SOH_IEEE.docx/.tex/.pdf`, `SmartEV_SOH_IEEE_overleaf.zip`; `P/SmartEV_partial_charging_SOH_paper.md` | Markdown copy = filled source (diff clean); PDF has 13 pages, no stale v1 values, no unfilled tokens, Fig. 1–14 in order; TeX braces balanced, 29/29 references cited |
| 17 | Limitations in paper | **Completed** | Table IX | Simulated crops, dataset heterogeneity, processed-release (not raw) exports, calibration under shift, GPU non-identity, three seeds, no field labels |
| 18 | Author names / affiliation | **Incomplete (placeholders)** | Paper front matter | `[Author Name]`, `[Institution]` must be filled in by the authors |
| 19 | Deliverables / integrity audit | **Completed** | `P/deliverables.md` §A–F | — |
| 20 | Version control | See §4 | — | — |
| 21 | Deployment into SmartEV (optional) | **Not started** | — | Paper Sec. VII describes a proposed integration only |

## 2. Final verified results (v2)

**Unseen cells, three seeds, all labels:**

| Model | RMSE (% SOH) | R² | 90 % coverage | Width |
|---|---|---|---|---|
| LightGBM (hand+curves) | **4.89 ± 0.19** | 0.793 | 0.895 | 14.1 |
| LightGBM (hand) | 4.94 ± 0.14 | 0.788 | 0.897 | 14.0 |
| CNN (supervised) | 5.81 ± 0.26 | 0.707 | 0.890 | 17.1 |
| CNN (SSL + fine-tune) | 5.89 ± 0.38 | 0.699 | 0.894 | 17.9 |
| Ridge | 7.46 ± 0.41 | 0.519 | — | — |

**10 % labels:** LightGBM 6.89 ± 0.84; CNN 7.25–7.30; Ridge 17.64 ± 14.38 (unstable).

**Leave-one-dataset-out, three seeds (RMSE mean ± sd):**

| Held out | LightGBM | CNN supervised | CNN SSL |
|---|---|---|---|
| MATR | 7.19 ± 0.65 | 6.54 ± 0.24 | 6.89 ± 0.57 |
| HUST | 8.59 ± 0.24 | 7.94 ± 0.14 | 8.03 ± 0.26 |
| SNL | 11.17 ± 0.31 | 12.53 ± 0.45 | 13.07 ± 0.97 |

Across all 27 runs, R² ≤ 0.03 and coverage ranged from 0.20 to 0.96.

**Hypotheses:**
- **H1 not supported:** LightGBM beats the encoders in every seed.
- **H2 not supported:** SSL − supervised = +0.08 / −0.05 pp, with no consistent sign. SSL was worse in 6 of 9 cross-dataset pairs.
- **H3 partly supported:** marginal coverage is near nominal, but coverage per source is 0.81–0.91 and per cell can be as low as 0.10. It collapses under dataset shift.

## 3. Claims changed from the v1 paper

- The CNN numbers were updated: the supervised/SSL figures went from 5.81/5.78 to 5.81/5.89, and the per-seed SSL deltas changed.
- "SSL gave the lowest error on held-out MATR" was removed, because it is not robust over seeds.
- "R² ≤ 0 in all nine cases" now holds for seed 0 only. Over three seeds the statement is R² ≤ 0.03.
- The per-side CQR correction for the encoders was corrected to 0.99 and 1.50 points.
- The computational cost now reflects the GPU and the measured times.
- "Validation error still decreasing" was replaced by the measured count: in 5 of 12 runs the best epoch was within the last 4 epochs.
- The reason for the NASA_B0045 exclusion was corrected.
- A reproducibility section (VI-G) and the Table VIII robustness table were added.

## 4. Version control

The research code and documents were committed on branch `research/partial-charge-soh-v2` (474448c code, 96d24a8 paper). Datasets, results and checkpoints were not committed: they live outside the repository, and `*.csv` is ignored. Unrelated uncommitted user changes (backend, frontend, staged redis deletions) were left untouched. Nothing was pushed, and no destructive git operation was used.

## 5. How to reproduce

```bash
python -I E/run_experiments.py W/windows.npz OUT main      # also: xdata, xdata3; SOH_SMOKE=1 for a smoke test
python -I E/verify_checkpoints.py W/windows.npz OUT main
python -I docs/paper/make_results_figures.py OUT docs/paper/figures
python -I docs/paper/ieee/build_ieee.py OUT
```
