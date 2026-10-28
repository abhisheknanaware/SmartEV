import xgboost as xgb
import numpy as np

X = np.random.randn(100, 5)
y = np.random.randn(100)

reg = xgb.XGBRegressor(n_estimators=10)
reg.fit(X, y)

reg.save_model("test_model.json")
print("Saved to test_model.json successfully!", flush=True)

reg2 = xgb.XGBRegressor()
reg2.load_model("test_model.json")
preds = reg2.predict(X[:3])
print("Loaded and predicted successfully! Preds:", preds, flush=True)
