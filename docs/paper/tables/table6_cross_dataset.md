| Held-out source | Model | Train cells | Test cells | RMSE (% SOH) | MAE (% SOH) | 90 % PI coverage | PI width (% SOH) |
|---|---|---|---|---|---|---|---|
| MATR | LightGBM (hand) | 135 | 169 | 7.508 | 5.942 | 0.83 | 20.673 |
| MATR | CNN (supervised) | 135 | 169 | 6.279 | 4.7 | 0.957 | 24.648 |
| MATR | CNN (SSL + fine-tune) | 135 | 169 | 6.268 | 4.884 | 0.941 | 23.6 |
| HUST | LightGBM (hand) | 201 | 77 | 8.494 | 7.522 | 0.212 | 6.984 |
| HUST | CNN (supervised) | 201 | 77 | 8.097 | 7.145 | 0.31 | 10.441 |
| HUST | CNN (SSL + fine-tune) | 201 | 77 | 7.954 | 7.015 | 0.336 | 11.047 |
| SNL | LightGBM (hand) | 213 | 61 | 10.924 | 8.906 | 0.626 | 21.266 |
| SNL | CNN (supervised) | 213 | 61 | 12.04 | 9.817 | 0.646 | 22.529 |
| SNL | CNN (SSL + fine-tune) | 213 | 61 | 12.196 | 9.859 | 0.715 | 24.748 |