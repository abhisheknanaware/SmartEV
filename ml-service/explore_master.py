import os
import pandas as pd

dataset_path = r"d:\EVFINAL\master_dataset.csv"
print(f"File exists: {os.path.exists(dataset_path)}")

# Read first 10,000 rows quickly
df = pd.read_csv(dataset_path, nrows=10000)
print(f"Loaded {len(df)} rows. Columns ({len(df.columns)}):")
print(df.columns.tolist())
print("\nChemistries:")
print(df['chemistry'].value_counts(dropna=False))
print("\nSources:")
print(df['source'].value_counts(dropna=False))
print("\nTarget SOH Stats:")
print(df['target_soh'].describe())
print("\nTarget RUL Cycles Stats:")
print(df['target_rul_cycles'].describe())
print("\nTarget Cycles to Knee Stats:")
print(df['target_cycles_to_knee'].describe())
print("\nSample row (key cols):")
print(df[['cell_id', 'chemistry', 'cycle_number', 'dod', 'ambient_temp_C', 'c_rate_charge', 'c_rate_discharge', 'ir_ohm', 'target_soh', 'target_rul_cycles']].head(3))
