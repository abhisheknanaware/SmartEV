# Self-Supervised and Uncertainty-Calibrated State-of-Health Estimation From Arbitrary Partial Charging Sessions Across Multiple Lithium-Ion Datasets

**Authors:** [AUTHOR NAMES AND AFFILIATIONS]

---

## Abstract

[RESULTS PENDING]

**Index Terms:** lithium-ion battery, state of health, partial charging, self-supervised learning, conformalized quantile
regression, uncertainty quantification, cross-dataset generalization, electric vehicles.

---

## I. Introduction

The traction battery is the most expensive and least observable component of an electric vehicle (EV). Its state of health
(SOH), defined here as the ratio of the currently deliverable discharge capacity to the rated capacity, determines the
remaining driving range, resale value, warranty status and charging behaviour. Laboratory capacity tests measure SOH
directly, but they require a full, controlled charge–discharge cycle that a vehicle in daily use rarely performs. What a
battery management system (BMS) does observe frequently is a *partial* charging session: the driver plugs in at an arbitrary
state of charge (SOC) and unplugs at another, and the BMS records terminal voltage and the charge accumulated in between.

Prior work has shown that partial charging and discharging segments carry degradation information. Chinomona *et al.* [1]
estimated capacity from fixed partial voltage windows of four NASA cells, and reported that the partial-charge window
(3.8–4.1 V) gave a markedly larger error (RMSE 0.13054 Ah) than a partial-discharge window (4.0–3.1 V, RMSE 0.06448 Ah).
Wang *et al.* [7] extracted an indirect health indicator from the constant-current (CC) charging stage. Tian *et al.* [13]
predicted complete charging curves from 30 points collected within 10 min. These studies, however, mostly use fixed voltage
windows, full CC stages, a single chemistry and, often, the same four NASA cells. Three issues relevant to field use remain
under-tested: (i) sessions that start and stop at *arbitrary* points, (ii) generalization to *unseen cells* and *unseen
datasets*, and (iii) uncertainty estimates whose coverage is *measured* on held-out cells rather than assumed.

This paper studies a focused question:

> **Research question.** How accurately, and with what calibrated uncertainty, can SOH be estimated from a single partial
> charging session of arbitrary start and length, when the evaluation is separated by cell and by dataset, and does
> self-supervised pre-training on unlabelled sessions improve over feature-based and supervised baselines?

The contributions are deliberately limited to what the experiments test:

1. **A leakage-controlled partial-session benchmark.** We construct 81,073 arbitrary partial charging sessions from 361 cells
   of six public datasets (CALCE, Sandia/SNL, HUST, MATR, NASA, Oxford; LFP, NMC, NCA, LCO, LCO/NCO). Sessions are defined by
   what a BMS can measure (voltage and accumulated charge since plug-in), never by the cell's true SOC or capacity, and all
   evaluation is separated by cell, with a leave-one-dataset-out protocol.
2. **An empirical comparison of representation choices** for this task: handcrafted session features with ridge regression
   and gradient-boosted trees, raw curves with gradient boosting, a supervised dual-view convolutional encoder, and the same
   encoder after self-supervised masked-curve pre-training, under full and scarce (10 %) label budgets.
3. **Measured calibration of conformalized quantile regression (CQR)** [17] for SOH intervals on unseen cells and under
   dataset shift, including where the exchangeability assumption fails.

The work is motivated by, and evaluated for, the battery-health module of SmartEV, an EV charging and route-planning platform (Fig. 1).

![Fig. 1. SmartEV system architecture. Solid boxes are implemented components; the dashed box is the battery-health module evaluated offline in this paper and proposed for integration.](figures/fig1_system_architecture.png)

We do not claim that self-supervised pre-training on partial charging data is new: closely related approaches have been
proposed recently [19]–[21]. Physics-constrained long-horizon forecasting (e.g., universal differential equations [18])
and the downstream SmartEV services (range, charging time, smart charging) are outside the evaluated scope and are discussed
as future work.

The remainder of the paper is organized as follows. Section II formulates the problem. Section III reviews related work and
Section IV states the gap. Section V describes the data, Section VI the methods and Section VII the experimental protocol.
Section VIII reports results, Section IX discusses SmartEV integration and Section X limitations.

![Fig. 2. Research framework evaluated in this paper: data harmonization, arbitrary partial-session construction, self-supervised masked-curve pre-training, quantile SOH head, split CQR calibration and cell- and dataset-separated evaluation (conceptual diagram).](figures/fig2_research_framework.png)

---

## II. Background and Problem Formulation

### A. Definitions

For cell $c$ and cycle $n$, let $Q^{\mathrm{dis}}_{c,n}$ (Ah) be the measured discharge capacity and $Q^{\mathrm{rated}}_c$
(Ah) the manufacturer's rated capacity. We define

$$\mathrm{SOH}_{c,n} = \frac{Q^{\mathrm{dis}}_{c,n}}{Q^{\mathrm{rated}}_c}. \tag{1}$$

SOH is dimensionless; errors are reported in percentage points of SOH (% SOH). SOH is *not* used interchangeably with
remaining useful life (RUL); RUL is defined in the dataset (cycles until $\mathrm{SOH} < 0.8$) but is not a prediction target
in this paper.

### B. Partial charging session

A charging session of cell $c$ in cycle $n$ starts at an unknown fraction $s$ of the full charge and ends at $e=s+w$. The BMS
observes terminal voltage $V(t)$ and the charge accumulated since the session started,

$$\Delta Q(t) = \int_{t_0}^{t} I(\tau)\, d\tau, \tag{2}$$

where $I$ is the charging current (A) and $t_0$ the plug-in time. The quantities $s$, $w$, $Q^{\mathrm{dis}}_{c,n}$ and the
true SOC are *not* observed. The estimation task is

$$\hat{y} = f_\theta\big(\{(V_k, \Delta Q_k)\}_{k\in\mathcal{S}},\; \mathbf{u}\big), \qquad y = \mathrm{SOH}_{c,n}, \tag{3}$$

where $\mathcal{S}$ indexes the samples inside the session and $\mathbf{u}$ is context available to a BMS (chemistry, ambient
temperature, charging C-rate). The model must also output an interval $[\hat{\ell}, \hat{u}]$ that contains $y$ with
probability at least $1-\alpha$ ($\alpha = 0.1$ in this study) over unseen cells.

---

## III. Related Work

Table I summarizes the studies verified in this work. Metrics are quoted as reported by the original authors; because
targets (capacity in Ah, SOH, normalized health indicators, RUL in cycles), datasets and protocols differ, they are **not
directly comparable** with each other or with our results.

**TABLE I. Verified literature comparison** (metrics as reported; "as reported in [survey]" marks values taken from the
supplied audited survey and spot-checked against the PDF where indicated).

| Ref. | Year | Dataset (cells) | Target | Method | Reported metric (unit) | Limitation relevant here |
|---|---|---|---|---|---|---|
| [1] Chinomona *et al.* | 2020 | NASA PCoE (B5, B6, B7, B18; LCO-type 18650, 2 Ah) | Capacity / RUL from partial data | Forward feature selection + LSTM | Partial charge 3.8–4.1 V: RMSE 0.13054 Ah; partial discharge 4.0–3.1 V: RMSE 0.06448 Ah (verified in PDF) | Fixed windows tuned on B5; 4 cells; no uncertainty |
| [2] Lyu *et al.* | 2023 | MIT-Stanford (124 LFP) + Tongji (57) | Early-cycle RUL | Lebesgue sampling + parallel-state-fusion LSTM | APE 3.59 % (MIT), 6.71 % (Tongji) at cycle 100 (verified in PDF) | Needs run-to-failure reference library; no intervals |
| [3] Liu *et al.* | 2021 | NASA (B5, B6, B18, B54–B56) + CALCE CS2 | Future capacity, RUL | LSTM + GPR hybrid | Capacity RMSE 0.0032; RUL error 3–4 cycles on B5/B6 (as reported in survey; 0.0032 verified in PDF) | Full capacity series; Gaussian residual assumption |
| [4] Zhu *et al.* | 2019 | NASA random-walk (RW3–RW6) + B5–B18 | RUL | DGWO-ELM | Relative RUL error < 3.2 % (as reported in survey; not re-verified) | Random discharge but CC-CV charge; no intervals |
| [5] Kong *et al.* | 2026 | NASA (B5, B6, B7, B18) | Capacity, RUL | Multi-scale CNN + multi-head attention LSTM + MC dropout | Capacity RMSE 0.0045–0.0112 (verified in PDF) | 4 lab cells; MC-dropout intervals not calibrated |
| [6] Wei & Wu | 2023 | NASA (B5, B6, B7, B18) | SOH, RUL | Entropy-graph GCN + LSTM + dual attention | Avg. SOH RMSE 0.0154; RUL RMSE 4.71–5.84 cycles (as reported in survey) | 4 cells, one chemistry; no intervals |
| [7] Wang *et al.* | 2023 | NASA (B5, B6, B7, B18) | Normalized HI, RUL | LTSA health indicator + adaptive self-attention LSTM | HI RMSE 0.020–0.024; RUL error 1–4 cycles (verified in PDF) | HI needs a full CC stage from low SOC |
| [8] Severson *et al.* | 2019 | MIT-Stanford (124 LFP) | Cycle life | ΔQ(V) features + elastic net | — (feature source for this work) | Full early-life cycles |
| [12] Roman *et al.* | 2021 | Multiple lab datasets | SOH | ML pipeline on charging features | — | Fixed feature windows |
| [13] Tian *et al.* | 2021 | Lab cells | Full charging curve | DNN from 30 points / 10 min | — | Short fixed-start segments |
| [14] Zhu *et al.* | 2022 | Commercial cells (lab) | Capacity | Features of voltage relaxation | — | Needs a rest period after charge |
| [15] Lu *et al.* | 2023 | Lab cells | SOH | Transfer from physics-generated data | — | Different setting (no new degradation tests) |
| [19] Wang *et al.* | 2024 | Lab database | SOH | Self-supervised framework with weak labels | — | Closely related SSL approach |
| [20] Teng *et al.* | 2026 | — (preprint) | SOH | Partial charging as natural masking for SSL pre-training | — | Closest prior idea; not peer-reviewed at time of writing |
| [21] Yao & Kowal | 2026 | — (preprint) | SOH | Degradation-aligned SSL under label sparsity | — | Preprint |
| [22] da Silva *et al.* | 2026 | — (preprint) | SOH forecasting | Conformalized transfer learning | — | Conformal intervals for SOH forecasting |

### A. Partial-data estimation

Chinomona *et al.* [1] demonstrated that truncated voltage windows of NASA cells retain capacity information, but their
windows were fixed and tuned on a single cell, and partial-*charge* windows were notably less accurate than partial-*discharge*
windows. Wang *et al.* [7] derived a health indicator from the CC charging stage, which presupposes charging from a low SOC.
Tian *et al.* [13] reconstructed full charging curves from short segments, and Zhu *et al.* [14] used post-charge voltage
relaxation. These methods reduce the data needed per estimate but do not evaluate sessions with arbitrary start and length
across several chemistries.

### B. Sequence models and uncertainty

Most RUL studies [2]–[7] model capacity sequences with recurrent or attention architectures. Uncertainty, where provided,
comes from Gaussian process regression [3] or Monte Carlo dropout [5]; neither offers finite-sample coverage guarantees, and
coverage on unseen cells is rarely reported. Conformal prediction [17] provides marginal coverage under exchangeability and
has begun to appear in battery prognostics [22]; its behaviour when calibration and test cells come from different datasets
remains an empirical question.

### C. Dataset diversity and benchmarks

Five of the seven audited studies ([1], [4]–[7]) evaluate on the same four 2007 NASA cells. Multi-dataset benchmarks such
as BatteryML [23] and BatteryLife [24] have since standardized larger collections; we use BatteryLife's processed release of
CALCE, SNL, HUST and MATR [24] together with the original NASA [9] and Oxford [11] files.

### D. Self-supervised learning

Masked reconstruction is a widely used self-supervised objective [16]. For batteries, self-supervised pre-training with weak
labels [19], cycle-order ranking [21], degradation-oriented objectives and treating partial charging as natural masking [20]
have been proposed. We therefore treat self-supervision as a baseline-worthy design choice to be tested, not as a novelty.

---

## IV. Research Gap and Contributions

**TABLE II. Gap analysis.**

| Gap | What prior work achieved | What remains open | Test in this paper |
|---|---|---|---|
| G1 Arbitrary sessions | Fixed windows [1], CC-stage HIs [7], short fixed-start segments [13] | Accuracy when start and length are random and only voltage + accumulated charge are observed | Random $s\in[0.05,0.60]$, $w\in[0.15,0.40]$; error vs. $s$ and $w$ (Fig. 8) |
| G2 Unseen cells / datasets | Mostly 4 NASA cells [1], [4]–[7]; within-dataset splits | Cell-separated and leave-one-dataset-out error across chemistries | GroupKFold-style cell splits; hold out MATR, HUST, SNL in turn (Table VI) |
| G3 Calibrated intervals | GPR [3], MC dropout [5]; coverage rarely measured | Empirical coverage of distribution-free intervals on unseen cells and under shift | Split CQR, coverage and width per source and per held-out dataset (Fig. 9, Fig. 11) |
| G4 Value of SSL | SSL proposed [19]–[21] | Whether masked-curve pre-training helps on this multi-source, arbitrary-session task, especially with few labels | Supervised vs. SSL encoder at 100 % and 10 % labels (Table V, Fig. 10) |

**Hypotheses.** H1: a learned dual-view encoder outperforms handcrafted-feature baselines on unseen cells. H2:
self-supervised pre-training improves the encoder most when labels are scarce (10 % of training cells). H3: split CQR
attains approximately the nominal 90 % coverage on unseen cells from seen datasets, but not necessarily on an unseen dataset.

---

## V. Datasets and Preprocessing

### A. Sources

**TABLE III. Datasets used** (statistics computed from the processed files; see the data card `datasets/master/README.md`).

| Source | Cells used | Chemistry | Rated capacity (Ah) | Ambient (°C) | Max charge C-rate | Partial sessions | SOH range (sessions) | Licence / citation |
|---|---|---|---|---|---|---|---|---|
| CALCE [10] | 13 | LCO (prismatic) | 1.1–1.35 | 25 | 0.5 | 3,118 | 0.50–1.05 | Research use; cite CALCE + articles |
| SNL [25] | 61 | LFP 18, NMC 21, NCA 22 (18650) | 1.1 / 3.0 / 3.2 | 15, 25, 35 | 0.5 | 14,640 | 0.50–1.01 | CC BY 4.0 (via [24]) |
| HUST [26] | 77 | LFP (18650) | 1.1 | 30 | 5 | 18,480 | 0.81–1.14 | CC BY 4.0 |
| MATR [8], [27] | 169 | LFP (18650) | 1.1 | 30 | up to 8 | 40,224 | 0.50–1.00 | CC BY 4.0 (via [24]) |
| NASA PCoE [9] | 33 | Undisclosed 18650 (2 Ah) | 2.0 | 4, 24, 43–44 | 0.75 | 3,587 | 0.50–1.02 | Public (US Gov.) |
| Oxford [11] | 8 | LCO/NCO pouch | 0.74 | 40 | 2 | 1,024 | 0.74–1.00 | ODbL |
| **Total** | **361** | 5 chemistries + 1 undisclosed | | | | **81,073** | | |

Of 362 harmonized cells, one NASA cell (B0045) had no valid charge curve and was excluded. VED trip data [28] is part of the
SmartEV dataset but is **not** used here, because it contains no battery-health labels.

![Fig. A. Dataset overview computed from the harmonized files: cells per source and chemistry (left) and SOH distribution of clean cycles per source (right).](figures/figA_dataset_overview.png)

### B. Harmonization and labelling

All sources were converted to SI units and one row per cell and cycle (400,224 cycles before cleaning). Charge current is
positive and discharge current negative in all lab sources. Oxford timestamps (stored in days) were converted to seconds.
NASA cells B0025–B0028, which appear twice in the original archive, were included once. SOH follows (1). Outlier cycles were
flagged per cell with a Hampel filter on SOH (window 21, threshold 3 scaled MAD, MAD floored at 0.5 % SOH to avoid
over-flagging smooth curves), which removed 0.29 % of cycles (11.7 % of NASA cycles, consistent with NASA's own note on
anomalous low-capacity runs). End-of-life labels (80 % rated capacity) agree with BatteryLife's published life labels within
5 cycles for 96.8 % of the labelled cells; they are not used in this SOH study.

### C. Partial-session construction

For each cell, up to 120 clean cycles with $0.5 \le \mathrm{SOH} \le 1.2$ were selected evenly over life, and two sessions
were sampled per cycle with $s\sim\mathcal{U}(0.05,0.60)$ and $w\sim\mathcal{U}(0.15,0.40)$ ($e=\min(s+w,0.98)$), where $s$
and $w$ are fractions of that cycle's full charge. The charging curve $V(q)$ is stored at 64 normalized charge points; for a
session, the accumulated charge is $\Delta Q = (q - s)\,Q^{\mathrm{ch}}_{c,n}$. **The model never receives $s$, $w$,
$Q^{\mathrm{ch}}$ or $Q^{\mathrm{dis}}$.** Each session is encoded in two views (Fig. 3):

- **Charge-domain view** $\mathbf{x}^{a}\in\mathbb{R}^{2\times48}$: terminal voltage at fixed accumulated-charge steps
  $\Delta Q / Q^{\mathrm{rated}} \in \{0, \dots, 0.40\}$, with a mask after the session ends.
- **Voltage-domain view** $\mathbf{x}^{v}\in\mathbb{R}^{2\times64}$: accumulated charge (normalized by rated capacity) at
  fixed voltages on a chemistry-specific grid (LFP 3.20–3.60 V; others 3.50–4.20 V), with a mask outside the observed range.

Normalizing by the *rated* capacity uses only a datasheet value. Because sessions are defined by the observable start and
end, the window-level ratio $\Delta Q/\Delta\mathrm{SOC}$ (which would reveal capacity) is not available to the model.
Nine handcrafted session features (start and end voltage, voltage span, accumulated charge, charge per volt, maximum and
location of incremental capacity $d\Delta Q/dV$, charge at mid-voltage, number of observed voltage bins) and five context
variables (chemistry one-hot, ambient temperature, charge C-rate) were computed for the baselines.

![Fig. 3. Measured charging curves at three ages for a Sandia NMC cell (left) and a MATR LFP cell (right); the shaded segment illustrates one partial charging session (window chosen for illustration). The MATR voltage drop near 0.8 reflects its multi-step fast-charging protocol.](figures/fig3_partial_charging_curves.png)

---

## VI. Methodology

### A. Baselines

1. **Ridge regression** on standardized handcrafted features and context.
2. **LightGBM (hand)**: gradient-boosted trees [29] on the same features.
3. **LightGBM (hand + curves)**: additionally the flattened two views (224 + 14 inputs).

The design choice between handcrafted features and raw views was made on a validation split of *training* cells only
(validation RMSE 4.17 % vs. 4.63 % for the charge-domain view alone), so the test cells were never used for model selection.

### B. Dual-view convolutional encoder

Each view is augmented with a third channel (a "hidden" flag, zero at fine-tuning time) and processed by its own encoder of
three 1-D convolutions (kernel 5, dilations 1, 2, 4, 48 channels, batch normalization, GELU, residual connections), keeping
the sequence length (Fig. 4). Masked mean and max pooling over observed positions give a 96-dimensional vector per view;
the two vectors and the context $\mathbf{u}$ feed an MLP (128 units, dropout 0.1) that outputs three quantiles. Ordering is
enforced by construction:



$$\hat{q}_{0.05} = m - \mathrm{softplus}(a),\quad \hat{q}_{0.5}=m,\quad \hat{q}_{0.95}=m+\mathrm{softplus}(b), \tag{4}$$

where $(a, m, b)$ are the head outputs. Training minimizes the summed pinball loss

$$\mathcal{L}_{\mathrm{sup}} = \sum_{\tau\in\{0.05,0.5,0.95\}} \frac{1}{N}\sum_{i=1}^{N} \rho_\tau\big(y_i-\hat{q}_{\tau,i}\big),\qquad
\rho_\tau(r)=\max\big(\tau r,(\tau-1)r\big). \tag{5}$$

### C. Self-supervised masked-curve pre-training

Before fine-tuning, both encoders are pre-trained on all training-cell sessions **without SOH labels**. For each session, one
contiguous block covering 30 % of the observed positions is hidden (value and mask set to 0, hidden flag set to 1) and a
1×1-convolution decoder reconstructs the hidden standardized values:

$$\mathcal{L}_{\mathrm{ssl}} = \sum_{v\in\{a,v\}} \frac{1}{|\mathcal{H}_v|}\sum_{k\in\mathcal{H}_v}\big(\hat{x}^{v}_k - x^{v}_k\big)^2, \tag{6}$$

where $\mathcal{H}_v$ is the set of hidden positions. The pre-trained encoder weights initialize the supervised model, which
is then fine-tuned end-to-end with (5). Pre-training uses only training cells; validation, calibration and test cells are
never seen.

![Fig. 4. Dual-view partial-curve encoder with ordered quantile head; the dashed decoder is used only during self-supervised pre-training (conceptual diagram).](figures/fig4_model_architecture.png)

### D. Split conformalized quantile regression

Quantile models (the CNNs, and LightGBM with quantile objectives for $\tau=0.05, 0.95$) are fitted on training cells. On the
disjoint calibration cells $\mathcal{C}$ we compute conformity scores [17]

$$E_i = \max\big(\hat{q}_{0.05}(x_i) - y_i,\; y_i - \hat{q}_{0.95}(x_i)\big),\quad i\in\mathcal{C}, \tag{7}$$

and the interval for a test session is

$$\big[\hat{q}_{0.05}(x)-\hat{Q},\; \hat{q}_{0.95}(x)+\hat{Q}\big],\qquad \hat{Q} = \text{the } \lceil (|\mathcal{C}|+1)(1-\alpha)\rceil\text{-th smallest } E_i. \tag{8}$$

The coverage guarantee of (8) holds under exchangeability of calibration and test samples. Sessions from the same cell are
dependent, and sessions from an unseen dataset are not exchangeable with the calibration set, so coverage is **measured**,
not assumed (Section VIII-C).

**Algorithm 1 — training and evaluation for one split**

```
Input: sessions D with cell ids; seed r; label fraction f; model M
1: Split cells (stratified by source) into test 20 %, then calibration 15 %, validation 15 %, train (rest)
2: Fit scalers on train cells only
3: if M = CNN-SSL: pre-train both encoders on all train-cell sessions with L_ssl (Eq. 6)
4: Choose labelled train cells: a random fraction f of train cells (f = 1 or 0.1)
5: Fit M on labelled train cells with early stopping on validation cells (Eq. 5 for CNNs)
6: Predict quantiles on calibration cells; compute Q̂ (Eqs. 7–8)
7: Predict test cells once; report RMSE, MAE, R², coverage and width
```

---

## VII. Experimental Setup

**TABLE IV. Configuration.**

| Item | Setting |
|---|---|
| Splits | Cell-level, stratified by source: test 20 %, calibration 15 % of the rest, validation 15 % of the remaining; seeds 0, 1, 2 |
| Label budgets | 100 % and 10 % of training cells labelled (SSL always uses all training-cell sessions, unlabelled) |
| Cross-dataset | Leave-one-source-out for MATR, HUST, SNL (seed 0, 100 % labels); the held-out source is the test set |
| Sessions | $s\sim\mathcal{U}(0.05,0.60)$, $w\sim\mathcal{U}(0.15,0.40)$; 2 per cycle; ≤ 120 cycles per cell |
| CNN | 2 × (3 dilated conv, 48 ch); MLP 128; AdamW, lr 2×10⁻³, weight decay 10⁻⁴, cosine schedule, batch 512, ≤ 25 epochs, early stopping patience 5 |
| SSL | 10 epochs, contiguous 30 % mask, MSE on hidden bins |
| LightGBM | 2000 trees max, lr 0.03, 31 leaves, min 40 samples/leaf, row/column subsampling 0.8, early stopping 100 rounds on validation cells |
| Ridge | α = 1, standardized inputs |
| Intervals | α = 0.10 (90 % nominal); split CQR on calibration cells |
| Metrics | RMSE, MAE (% SOH); R²; empirical coverage; mean interval width (% SOH) |
| Software / hardware | Python 3.13, PyTorch 2.11 (CPU, 16 threads), LightGBM 4.6, scikit-learn 1.7; Windows 11, 24-core CPU |

![Fig. 5. Cell-separated data partitioning and leakage controls (conceptual diagram).](figures/fig5_data_workflow.png)

Metrics: $\mathrm{RMSE}=\sqrt{\tfrac1N\sum(\hat y_i-y_i)^2}\times100$ and $\mathrm{MAE}=\tfrac1N\sum|\hat y_i-y_i|\times100$
(% SOH); coverage $=\tfrac1N\sum \mathbb{1}[\hat\ell_i\le y_i\le\hat u_i]$; width $=\tfrac1N\sum(\hat u_i-\hat\ell_i)\times100$.

---

## VIII. Results and Discussion

[RESULTS PENDING]

---

## IX. SmartEV System Integration and Practical Implications

SmartEV (Fig. 1) is a web platform for EV charging-station discovery, slot reservation with Redis-based holds and
server-verified Razorpay payments, route planning, and a battery dashboard; its FastAPI service currently hosts heuristic
recommendation and demand modules. The SOH estimator studied here has been evaluated **offline only**; it is not yet
deployed in the application.



A prototype integration would: (i) receive each completed charging session (voltage and accumulated charge, chemistry,
ambient temperature, C-rate) from the vehicle or charger; (ii) return the median SOH and the 90 % CQR interval; (iii) smooth
successive estimates per vehicle before display; and (iv) show the owner plain-language range information (e.g., estimated
full-charge range = SOH × rated range) together with its uncertainty. Interval width should gate decisions: a wide interval
should trigger "estimate improving" messaging rather than an alert. Because the evaluated cells are laboratory cells, and
coverage under dataset shift was measured to be [RESULTS PENDING], any deployment would require recalibration on field data
and monitoring of coverage over time. The estimator does not by itself guarantee battery safety or optimize charging; those
functions are out of scope.

---

## X. Limitations and Threats to Validity

**TABLE VIII. Limitations and deployment implications.**

| Limitation | Effect | Addressed here? |
|---|---|---|
| Laboratory cells (0.74–3.2 Ah) under controlled protocols | Field packs, cell-to-cell imbalance and BMS SOC/current errors are absent | No — requires fleet data |
| Sessions are simulated by cropping measured full charges | Real sessions include rest, temperature transients and current variation | Partially (random start/length) |
| LFP dominates (264 of 361 cells) | Aggregate metrics weighted towards LFP | Per-source results reported |
| Dependent sessions within a cell | CQR exchangeability holds at best approximately | Coverage measured, not assumed |
| Unseen-dataset shift | Coverage can drop when calibration data come from other datasets | Measured in leave-one-dataset-out |
| No ground-truth fleet SOH labels | Cannot validate field accuracy | No |
| Ambient temperature per test, not per session | Context is coarse | No |
| Single architecture family; limited hyperparameter search | Results are not an upper bound | Disclosed |
| CPU-only training, 3 seeds | Variance estimates are coarse | Seeds reported |

---

## XI. Conclusion and Future Work

[RESULTS PENDING]

Future work: physics-constrained degradation forecasting with explicitly enforced monotonicity (e.g., a universal
differential equation with a non-negative learned fade rate [18]); conformal methods for dependent and shifted data; field
validation with fleet charging sessions; and integration of the calibrated estimate into SmartEV range and charging services.

---

## References

[1] B. Chinomona, C. Chung, L.-K. Chang, W.-C. Su, and M.-C. Tsai, "Long short-term memory approach to estimate battery remaining useful life using partial data," *IEEE Access*, vol. 8, pp. 165419–165431, 2020, doi: 10.1109/ACCESS.2020.3022505.

[2] G. Lyu, H. Zhang, and Q. Miao, "Parallel state fusion LSTM-based early-cycle stage lithium-ion battery RUL prediction under Lebesgue sampling framework," *Reliab. Eng. Syst. Saf.*, vol. 236, Art. no. 109315, 2023, doi: 10.1016/j.ress.2023.109315.

[3] K. Liu, Y. Shang, Q. Ouyang, and W. D. Widanage, "A data-driven approach with uncertainty quantification for predicting future capacities and remaining useful life of lithium-ion battery," *IEEE Trans. Ind. Electron.*, vol. 68, no. 4, pp. 3170–3180, 2021, doi: 10.1109/TIE.2020.2973876.

[4] J. Zhu, T. Tan, L. Wu, and H. Yuan, "RUL prediction of lithium-ion battery based on improved DGWO-ELM method in a random discharge rates environment," *IEEE Access*, vol. 7, pp. 125176–125187, 2019, doi: 10.1109/ACCESS.2019.2936822.

[5] Z. Kong, S. Li, and C. Wang, "Estimation and uncertainty quantification of remaining useful life (RUL) of electric vehicle batteries using a temporal deep model," *Sci. Rep.*, vol. 16, Art. no. 18704, 2026, doi: 10.1038/s41598-026-54385-4.

[6] Y. Wei and D. Wu, "Prediction of state of health and remaining useful life of lithium-ion battery using graph convolutional network with dual attention mechanisms," *Reliab. Eng. Syst. Saf.*, vol. 230, Art. no. 108947, 2023, doi: 10.1016/j.ress.2022.108947.

[7] Z. Wang, N. Liu, C. Chen, and Y. Guo, "Adaptive self-attention LSTM for RUL prediction of lithium-ion batteries," *Inf. Sci.*, vol. 635, pp. 398–413, 2023, doi: 10.1016/j.ins.2023.01.100.

[8] K. A. Severson *et al.*, "Data-driven prediction of battery cycle life before capacity degradation," *Nat. Energy*, vol. 4, pp. 383–391, 2019, doi: 10.1038/s41560-019-0356-8.

[9] B. Saha and K. Goebel, "Battery data set," NASA Ames Prognostics Data Repository, NASA Ames Research Center, Moffett Field, CA, USA, 2007.

[10] Y. Xing, E. W. M. Ma, K.-L. Tsui, and M. Pecht, "An ensemble model for predicting the remaining useful performance of lithium-ion batteries," *Microelectron. Reliab.*, vol. 53, no. 6, pp. 811–820, 2013, doi: 10.1016/j.microrel.2012.12.003.

[11] C. R. Birkl, "Diagnosis and prognosis of degradation in lithium-ion batteries," Ph.D. dissertation, Dept. Eng. Sci., Univ. Oxford, Oxford, U.K., 2017. (Oxford Battery Degradation Dataset 1, Univ. Oxford Research Archive.)

[12] D. Roman, S. Saxena, V. Robu, M. Pecht, and D. Flynn, "Machine learning pipeline for battery state-of-health estimation," *Nat. Mach. Intell.*, vol. 3, pp. 447–456, 2021, doi: 10.1038/s42256-021-00312-3.

[13] J. Tian, R. Xiong, W. Shen, J. Lu, and X.-G. Yang, "Deep neural network battery charging curve prediction using 30 points collected in 10 min," *Joule*, vol. 5, no. 6, pp. 1521–1534, 2021, doi: 10.1016/j.joule.2021.05.012.

[14] J. Zhu *et al.*, "Data-driven capacity estimation of commercial lithium-ion batteries from voltage relaxation," *Nat. Commun.*, vol. 13, Art. no. 2261, 2022, doi: 10.1038/s41467-022-29837-w.

[15] J. Lu, R. Xiong, J. Tian, C. Wang, and F. Sun, "Deep learning to estimate lithium-ion battery state of health without additional degradation experiments," *Nat. Commun.*, vol. 14, Art. no. 2760, 2023, doi: 10.1038/s41467-023-38458-w.

[16] K. He, X. Chen, S. Xie, Y. Li, P. Dollár, and R. Girshick, "Masked autoencoders are scalable vision learners," in *Proc. IEEE/CVF Conf. Comput. Vis. Pattern Recognit. (CVPR)*, 2022, pp. 15979–15988, doi: 10.1109/CVPR52688.2022.01553.

[17] Y. Romano, E. Patterson, and E. J. Candès, "Conformalized quantile regression," in *Adv. Neural Inf. Process. Syst. (NeurIPS)*, vol. 32, 2019; arXiv:1905.03222.

[18] C. Rackauckas *et al.*, "Universal differential equations for scientific machine learning," arXiv:2001.04385, 2020.

[19] T. Wang, Z. Ma, S. Zou, Z. Chen, and P. Wang, "Lithium-ion battery state-of-health estimation: A self-supervised framework incorporating weak labels," *Appl. Energy*, vol. 355, Art. no. 122332, 2024, doi: 10.1016/j.apenergy.2023.122332.

[20] L. Teng, W. Li, and Z. Li, "Partial charging as natural masking: Self-supervised pre-training for lithium-ion battery state of health prediction," SSRN preprint, 2026, doi: 10.2139/ssrn.7552735.

[21] J. Yao and J. Kowal, "Degradation-aligned self-supervised learning for state of health estimation of lithium-ion batteries under label sparsity," arXiv:2608.16612, 2026.

[22] S. F. da Silva, M. F. Ozkan, F. El Idrissi, and M. Canova, "Conformalized transfer learning for Li-ion battery state of health forecasting under manufacturing and usage variability," arXiv:2603.24475, 2026.

[23] H. Zhang *et al.*, "BatteryML: An open-source platform for machine learning on battery degradation," arXiv:2310.14714, 2023.

[24] R. Tan *et al.*, "BatteryLife: A comprehensive dataset and benchmark for battery life prediction," arXiv:2502.18807, 2025.

[25] Y. Preger *et al.*, "Degradation of commercial lithium-ion cells as a function of chemistry and cycling conditions," *J. Electrochem. Soc.*, vol. 167, no. 12, Art. no. 120532, 2020, doi: 10.1149/1945-7111/abae37.

[26] G. Ma *et al.*, "Real-time personalized health status prediction of lithium-ion batteries using deep transfer learning," *Energy Environ. Sci.*, vol. 15, pp. 4083–4094, 2022, doi: 10.1039/D2EE01676A.

[27] P. M. Attia *et al.*, "Closed-loop optimization of fast-charging protocols for batteries with machine learning," *Nature*, vol. 578, pp. 397–402, 2020, doi: 10.1038/s41586-020-1994-5.

[28] G. S. Oh, D. J. LeBlanc, and H. Peng, "Vehicle energy dataset (VED), a large-scale dataset for vehicle energy consumption research," arXiv:1905.02081, 2019.

[29] G. Ke *et al.*, "LightGBM: A highly efficient gradient boosting decision tree," in *Adv. Neural Inf. Process. Syst. (NIPS)*, vol. 30, 2017.
