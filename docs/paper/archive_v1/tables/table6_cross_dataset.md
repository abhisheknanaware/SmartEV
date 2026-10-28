| Held-out source | Model | Train cells | Test cells | RMSE (% SOH) | MAE (% SOH) | 90 % PI coverage | PI width (% SOH) |
|---|---|---|---|---|---|---|---|
| MATR | LightGBM (hand) | 135 | 169 | 7.508 | 5.942 | 0.83 | 20.673 |
| MATR | CNN (supervised) | 135 | 169 | 7.648 | 5.705 | 0.91 | 23.325 |
| MATR | CNN (SSL + fine-tune) | 135 | 169 | 6.438 | 4.885 | 0.946 | 23.908 |
| HUST | LightGBM (hand) | 201 | 77 | 8.494 | 7.522 | 0.212 | 6.984 |
| HUST | CNN (supervised) | 201 | 77 | 7.935 | 6.988 | 0.309 | 10.059 |
| HUST | CNN (SSL + fine-tune) | 201 | 77 | 8.063 | 7.095 | 0.316 | 10.373 |
| SNL | LightGBM (hand) | 213 | 61 | 10.924 | 8.906 | 0.626 | 21.266 |
| SNL | CNN (supervised) | 213 | 61 | 11.862 | 9.565 | 0.61 | 23.387 |
| SNL | CNN (SSL + fine-tune) | 213 | 61 | 12.18 | 10.073 | 0.648 | 24.401 |