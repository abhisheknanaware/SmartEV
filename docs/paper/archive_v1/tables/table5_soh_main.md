| Labels | Model | RMSE (% SOH) | MAE (% SOH) | R² | 90 % PI coverage | PI width (% SOH) |
|---|---|---|---|---|---|---|
| 100 % of train cells | Ridge (hand) | 7.46 ± 0.41 | 5.65 | 0.519 | — | — |
| 100 % of train cells | LightGBM (hand) | 4.94 ± 0.14 | 3.43 | 0.788 | 0.897 | 14.05 |
| 100 % of train cells | LightGBM (hand+curves) | 4.89 ± 0.19 | 3.37 | 0.793 | 0.895 | 14.12 |
| 100 % of train cells | CNN (supervised) | 5.81 ± 0.28 | 4.14 | 0.707 | 0.892 | 17.17 |
| 100 % of train cells | CNN (SSL + fine-tune) | 5.78 ± 0.26 | 4.08 | 0.710 | 0.893 | 17.10 |
| 10 % of train cells | Ridge (hand) | 17.64 ± 14.38 | 10.30 | -2.321 | — | — |
| 10 % of train cells | LightGBM (hand) | 6.89 ± 0.88 | 4.78 | 0.591 | 0.885 | 18.38 |
| 10 % of train cells | LightGBM (hand+curves) | 6.89 ± 0.84 | 4.78 | 0.590 | 0.888 | 18.78 |
| 10 % of train cells | CNN (supervised) | 7.30 ± 0.51 | 5.41 | 0.538 | 0.885 | 22.89 |
| 10 % of train cells | CNN (SSL + fine-tune) | 7.26 ± 0.77 | 5.32 | 0.543 | 0.883 | 22.89 |