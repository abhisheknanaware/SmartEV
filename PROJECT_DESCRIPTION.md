# SmartEV: Intelligent EV Charging, Navigation and Battery Health Platform

## 1. Overview

SmartEV is a final-year AI/ML capstone project. It is a full platform for electric-vehicle owners that combines:

- **Charging-station discovery and booking** along the Pune–Mumbai Expressway (NH 48)
- **Route planning** with AI-recommended charging stops
- **Slot reservation** with secure payment and a digital QR pass
- **AI battery intelligence** that predicts battery health, remaining life, current status and future risk, and explains them in
  plain language on the owner's car or app screen

Battery intelligence is the research core of the project; the rest of the platform is where it is used.

---

## 2. Problem Statement

EV owners face four uncertainties:

1. **"How healthy is my battery?"** Capacity fades invisibly over time.
2. **"How long will it last?"** The battery is 30–40% of the vehicle cost, and replacement is expensive.
3. **"Can I reach my destination, and where should I charge?"** Range shrinks with age, heat and driving style.
4. **"Will a charger be free when I arrive?"** Stations are congested during peak hours.

Existing tools usually answer only one of these, rely on lab data alone, and give single numbers without confidence or
explanation.

---

## 3. Objectives

- Predict **current battery health (SOH)**, **remaining useful life (RUL)**, **current status** and **future risk**, each with a
  confidence range.
- Turn predictions into **simple, actionable guidance** for non-technical owners.
- Use battery health to make **range, charging-time, station recommendations and charging plans** smarter.
- Provide **reliable, conflict-free slot booking** with secure payment.
- Publish a **research paper** with honest, reproducible results.

---

## 4. System Architecture (Application)

| Layer | Technology | Role |
|---|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Leaflet, Recharts | Dashboard, map and route planning, station details, booking, battery dashboard, admin analytics, AI chat assistant |
| Backend | Spring Boot 3 (Java 17), Spring Security, JWT | Authentication and roles, stations, slots, bookings, payments, vehicles, reviews, notifications, admin analytics |
| ML service | Python, FastAPI | Battery models, station recommendation, demand forecasting, AI copilot |
| Database | PostgreSQL (Neon cloud) | Users, vehicles, stations, slots, bookings, payments, battery telemetry |
| Cache / locks | Redis | 10-minute slot-hold locks to prevent double booking |
| Payments | Razorpay (test mode) | Orders and server-side HMAC-SHA256 signature verification |
| QR passes | ZXing | Digital gate pass after booking confirmation |

```text
React UI ──REST + JWT──► Spring Boot API ──► PostgreSQL (permanent data)
                               │      └────► Redis (slot-hold locks)
                               └──HTTP──► FastAPI ML service (models)
External: Razorpay · weather API · LLM (optional, copilot)
```

### Booking flow

1. The driver selects a bay and time; Redis places a **10-minute hold**.
2. A Razorpay order is created and the driver pays.
3. The backend verifies the payment signature, the order ID, the hold status and the expiry.
4. The booking becomes **CONFIRMED**, and a QR pass and an in-app notification are generated.
5. Unpaid holds expire automatically and the bay returns to the pool.

### Pre-seeded charging network (NH 48)

Eight expressway hubs (Wakad, Baner, Hinjewadi, Talegaon, Lonavala, Khalapur, Vashi, BKC), each with 10 bays and
60–180 kW chargers.

---

## 5. Battery Intelligence (Research Core)

### 5.1 What the owner sees

A simple card with no technical jargon:

- **Status in one colour:** green "Your battery is in good shape" / amber "Check-up advised" / red "Service now"
- **Range today vs new:** "382 km of 420 km when new"
- **Expected life:** "About 6 more years (~1.1 lakh km at your usual driving)"
- **One personalised tip:** "Charge to 80% on normal days; could add about 1 year"
- **Warranty status**, plus safety alerts with one clear action when needed

Technical values (SOH %, RUL cycles, internal resistance, anomaly log) are kept in a separate service view.

### 5.2 Architecture: from data to models

| Stage | Purpose | Key methods |
|---|---|---|
| 1. Data acquisition | Collect lab, real-car and context data | NASA, CALCE, Sandia, Severson/MATR, Oxford, HUST; VED trips; weather; MSEDCL tariff |
| 2. Preprocessing and labelling | Clean, harmonise, add the answers | Hampel filter, SI units, lab-to-fleet-style rows, SOH / RUL / knee / censoring labels |
| 3. Feature extraction | Turn raw signals into clues | IC/DV peaks, ΔQ(V), relaxation voltage, rainflow cycle depths, SOC–temperature dwell, lithium-plating dose, charge taper onset, pulse resistance, cell voltage spread, self-supervised curve embeddings |
| 4. Feature selection | Keep only reliable clues | Leakage check → mutual information → SHAP + permutation importance → stability across folds |
| 5. New techniques | Improve accuracy and trust | Self-supervised pre-training, lab-to-fleet transfer (CORAL), physics constraints (monotone trees, degradation law), Optuna in nested GroupKFold, stacking, conformal intervals (CQR), isotonic calibration, Kalman smoothing, particle filter |
| 6. Model training | Base model, then child models | GroupKFold by cell, nested tuning, early stopping, MLflow tracking |

```text
Data acquisition → Preprocessing + labelling → Feature extraction → Feature selection
      → New techniques → Model training (M1 → M2–M8) → Evaluation → Deployment
                                     ▲                                   │
                                     └──── new app data (feedback loop) ─┘
```

### 5.3 The seven models

| Model | Question for the owner | Algorithm |
|---|---|---|
| **M1 Health now** (base) | "How much range have I lost?" | Pre-trained curve encoder (TCN/Mamba) + KAN head, stacked with LightGBM and TabPFN v2; physics check, Kalman smoothing, conformal range |
| **M2 Forecast** | "How many years are left?" | Physics-informed universal differential equation (UDE) + per-vehicle particle filter |
| **M3 Risk** | "Any trouble in the next 6–12 months?" | DeepHit competing-risks survival model (uses censored batteries) |
| **M4 Safety** | "Is anything dangerous now?" | Digital-twin residual + conformal anomaly detection with a fixed false-alarm rate |
| **M5 Range** | "How far can I go today?" | Grey-box vehicle-energy physics + quantile LightGBM |
| **M6 Charge time** | "How long will charging take?" | CC-CV taper model + gradient boosting correction |
| **M8 Smart charging** | "When and how much should I charge?" | Model predictive control (MPC) balancing ₹ cost, battery wear (from M2) and readiness |

```text
                 M1 Health now (base)
       ┌────────────┬─────┴──────┬─────────────┐
       ▼            ▼            ▼             ▼
   M4 Safety   M2 Forecast   M5 Range     M6 Charge time
                 │     └───────────────┐       │
                 ▼                     ▼       ▼
              M3 Risk             M8 Smart charging
```

Build order: **M1 → M4 → M2 → M3 → M6 → M5 → M8**.

### 5.4 Research contributions

1. **SOH from partial charging curves**, the data real cars record every day, using a self-supervised pre-trained encoder with an
   interpretable KAN head.
2. **Physics-informed, personalised degradation forecasting** with uncertainty (UDE + particle filter).
3. **Survival-based future risk** that correctly uses batteries that have not failed yet (censored data).
4. **Safety alerts with a guaranteed false-alarm rate** (conformal digital-twin residuals).
5. **One system linking battery health** to range, charging time, station choice and cost-aware charging.

### 5.5 Evaluation protocol

- GroupKFold split by cell (no battery appears in both training and test)
- Leave-one-dataset-out testing (generalisation to unseen data)
- Early-life RUL tests (10%, 20% and 50% of life observed)
- Per-chemistry results, ablation studies and literature baselines (LR, RF, GBDT, LSTM/GRU)
- Friedman and Wilcoxon significance tests; measured inference latency

**Metrics:** MAE/RMSE (SOH) · curve RMSE and interval coverage (forecast) · C-index, Brier score and calibration (risk) ·
precision/recall on injected faults (safety) · MAPE (range) · MAE in minutes (charge time) · wear avoided and ₹ saved (smart
charging)

---

## 6. Data (Status: Complete)

A merged, harmonised **master dataset** is stored in `Documents/Ai ev/datasets/master/`.

| Item | Value |
|---|---|
| Battery cells | **362** from 6 sources |
| Cycles | **400,224** |
| Chemistries | LFP 264 · NCA 22 · NMC 21 · LCO 13 · LCO/NCO 8 · undisclosed 34 |
| Temperatures | 4 °C to 44 °C |
| Labels | SOH, end of life (80%), RUL, knee point, censoring; 95.8% of cells match BatteryLife's published labels within 5 cycles |
| Curves | Discharge Q(V) and charge V(q) curves for every cycle |
| Real driving data | 4,109 EV/PHEV trips (VED); EVs about 145 Wh/km, rising to about 228 Wh/km below 0 °C |

| Source | Cells | Chemistry | Temperature | Cycles |
|---|---|---|---|---|
| CALCE | 13 | LCO | 25 °C | 14,298 |
| SNL (Sandia) | 61 | LFP, NMC, NCA | 15 / 25 / 35 °C | 96,492 |
| HUST | 77 | LFP | 30 °C | 146,120 |
| MATR (Severson) | 169 | LFP | 30 °C | 140,001 |
| NASA PCoE | 34 | undisclosed | 4–44 °C | 2,794 |
| Oxford | 8 | LCO/NCO | 40 °C | 519 |

Pipeline scripts are in `ml-service/training/data_acquisition/`:

- `extract.py`: safe unpacking (path-traversal checks)
- `safe_pickle.py`: inspects and loads pickle files without running code
- `build_master.py`: merges all sources; `--relabel` recomputes labels in seconds
- `build_ved.py`: builds the EV trip-energy tables for M5

Files of the master dataset:

| File | Contents |
|---|---|
| `cells.parquet` / `cells.csv` | One row per cell: chemistry, conditions, life labels, citation |
| `cycles.parquet` | One row per cell × cycle: capacity, SOH, energy, timing, temperature, resistance, RUL, outlier flag |
| `curves/<SOURCE>.npz` | Per-cycle curves for feature extraction |
| `ved_ev_trips.parquet` | Real EV/PHEV trips: distance, Wh/km, outside temperature, AC/heater |
| `README.md` | Data card: definitions, conventions, limitations, required citations |

---

## 7. Other AI Features in the Platform

- **Station recommendation:** currently a weighted score of charger speed, free slots, detour, tariff, rating and SOC. Planned:
  learning-to-rank that accounts for battery health.
- **Demand forecasting:** 24-hour station utilisation. Currently a formula. Planned: a model trained on booking history.
- **AI copilot:** a chat assistant for trip questions, stop suggestions and one-click booking. It uses an LLM when one is
  configured, otherwise rule-based replies.

---

## 8. Work Completed So Far

| Area | Status |
|---|---|
| Security fixes | Secrets moved to environment variables (`backend/.env`, see `.env.example`); admin self-registration blocked; payment-signature bypass gated behind a demo flag; payment verification checks order, status and expiry; endpoint permissions tightened; booking ownership checks; 403/409 error responses. Backend compiles. |
| Repo cleanup | Redis binaries and Vite temp files removed from git tracking |
| ML review | Found that the deployed `soh_model`, `risk_classifier` and `rf_soh_model` files are corrupted (all zeros), so the live app falls back to a formula. They will be replaced by the new models. |
| Architecture | Final ML architecture agreed (six stages, seven models) |
| Data | About 7.1 GB downloaded and verified; master dataset built |

---

## 9. Remaining Work

1. **Rotate credentials:** reset the Neon database password, regenerate the Razorpay keys and create a new JWT secret. The
   previous values were pushed to GitHub.
2. **Stages 2–4:** tune the cleaning step and build the features.
3. **Train the models** in build order (M1 → M4 → M2 → M3 → M6 → M5 → M8), with baselines and ablations.
4. **Evaluate** with cell-wise and cross-dataset splits and significance tests.
5. **Integrate** the models into the FastAPI service and the React battery dashboard (owner card).
6. **Update the research paper** with the new methodology and real results. The current numbers come from the old pipeline.
7. **Deployment:** add Dockerfiles and database migrations (Flyway) so the whole system starts with one command.

---

## 10. Tech Stack

- **Frontend:** React 18 · Vite · Tailwind CSS · Leaflet · Recharts
- **Backend:** Spring Boot 3 · Spring Security · JWT · JPA · Redis · PostgreSQL · Razorpay · ZXing
- **ML:** Python · FastAPI · LightGBM · XGBoost · TabPFN · PyTorch (TCN/Mamba, KAN, DeepHit) · physics-informed models ·
  conformal prediction · Optuna · MLflow
- **Data:** NASA · CALCE · Sandia · MATR · HUST · Oxford · VED · BatteryLife

---

## 11. Datasets and Citations

- CALCE: CALCE Battery Data, University of Maryland (plus at least 3 CALCE articles)
- SNL: Preger et al., *Journal of the Electrochemical Society*, 2020
- HUST: Ma et al., *Energy & Environmental Science*, 2022
- MATR: Severson et al., *Nature Energy*, 2019; Attia et al., *Nature*, 2020
- NASA: Saha & Goebel, NASA Ames Prognostics Data Repository, 2007
- Oxford: Birkl, PhD thesis, University of Oxford, 2017 (Oxford Battery Degradation Dataset 1)
- VED: Oh, LeBlanc & Peng, arXiv:1905.02081, 2019
- BatteryLife (processed CALCE, SNL, HUST, MATR): Tan et al., arXiv:2502.18807, 2025
