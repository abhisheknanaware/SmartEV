# SmartEV battery models: training report (rounds 1–3)

All results: mean over 3 cell-separated seeds (vehicle-separated for M5), same test cells in every round.
Selection between configurations used validation cells only. Raw outputs:
`datasets/experiments/models/results_round{1,2,3}.json`. Scripts: `ml-service/training/models/train_all.py`,
`train_round2.py`, `train_round3.py`.

| Model | Metric | Baseline | Round 1 | Round 2 (fixes) | Round 3 (validated) | Final choice |
|---|---|---|---|---|---|---|
| M1 health, field | RMSE % SOH | 11.85 (mean) | **3.22** | 3.36 | 3.20 | Plain LightGBM (constraints/weights did not help) |
| M1 health, lab | RMSE % SOH | 11.85 | **2.24** | 2.28 | 2.21 | Plain LightGBM |
| M2 RUL | MAE cycles / MAPE % | 875 / 150 (fair fade extrapolation) | **101 / 15.8** | 121 / 16.2 | — | Round-1 model (raw-RUL target) |
| M3 risk | C-index / ECE | 0.52 (cycles only) | 0.944 / — | **0.943 / 0.045** | — | Round-2 (tuned AFT scale, calibrated) |
| M4 safety | Recall @ ~1 % false alarms | — | 6.4 % | **60.8 %** (AUROC 0.89) | — | Digital-twin max-\|z\| detector |
| M5 range | Distance-weighted MAPE % | 49.1 (vehicle's own mean) | 51.7* | 45.0 | **37.5** | Global model + per-vehicle calibration |
| M6 charge time | MAE min | **0.42** (persistence) | 1.20 | 0.61 | 0.42 | Persistence (model only for Oxford) |
| M8 smart charging | Cost / wear saved | charge now | 44 % / 42 %† | **8.7 % / 14.0 %** | — | Equal-energy simulation result |

\* Round-1 M5 used unweighted MAPE on all trips. † Round-1 M8 comparison was unfair (planned strategy charged less energy).

## Findings

1. **M1** — accurate on unseen cells except NASA (≈ 8 % RMSE), whose 4 °C runs have anomalous low capacities documented by NASA.
   Cell-balanced weights and monotone constraints shifted error between sources but did not reduce it overall.
2. **M2** — 15.8 % relative RUL error, about 9× better than a fair physics-style extrapolation; a log target gave no gain.
3. **M3** — ranks cells by time to end of life very well (C = 0.94) and its 200-cycle risk probabilities are calibrated
   (ECE 0.045).
4. **M4** — the decisive fix was comparing each cycle with *its own cell's* recent history (digital-twin residuals) rather
   than with the whole fleet: recall rose from 6 % to 61 %. Resistance faults stay hard (21 %) because resistance is measured
   in only ~26 % of cells.
5. **M5** — VED (27 vehicles, 6 per test split) is too small for a general model; learning each vehicle's own offset from its
   first 30 % of trips gave the largest gain (44 → 37.5 %). Field data from SmartEV users is required.
6. **M6** — in laboratory protocols the last charge time is the best predictor; the learned correction only helped on Oxford.
   A learned model is justified only when charging conditions change (field data).
7. **M8** — under an equal-energy, deadline-feasible comparison the planner saves 8.7 % cost and 14 % modelled wear; this is a
   simulation with an assumed tariff, temperature and wear model, not a measured result.
