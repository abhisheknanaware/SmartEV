import os
import sys
import json
import numpy as np
import pandas as pd

print("=== STARTING RIGOROUS DATASET AUDIT ===")

ROOT_DIR = r"d:\EVFINAL"
master_csv = os.path.join(ROOT_DIR, "master_dataset.csv")
fleet_csv = os.path.join(ROOT_DIR, "ev_battery_health.csv")

print(f"Master CSV exists: {os.path.exists(master_csv)}, size: {os.path.getsize(master_csv):,} bytes")
print(f"Fleet CSV exists: {os.path.exists(fleet_csv)}, size: {os.path.getsize(fleet_csv):,} bytes")

# 1. AUDIT MASTER_DATASET.CSV
print("\n--- 1. AUDITING MASTER_DATASET.CSV ---")
chunk_size = 50000
total_rows = 0
sources = {}
chemistries = {}
cells = set()
source_cells = {}
source_chem = {}
missing_counts = None
columns = []

# First inspect header
df_head = pd.read_csv(master_csv, nrows=5)
columns = list(df_head.columns)
print(f"Number of columns: {len(columns)}")
print("Columns:", columns)

missing_counts = pd.Series(0, index=columns)
target_stats = {
    'target_soh': {'min': float('inf'), 'max': float('-inf'), 'count': 0, 'null': 0},
    'target_rul_cycles': {'min': float('inf'), 'max': float('-inf'), 'count': 0, 'null': 0, 'neg': 0},
    'target_cycles_to_knee': {'min': float('inf'), 'max': float('-inf'), 'count': 0, 'null': 0, 'neg': 0}
}

for i, chunk in enumerate(pd.read_csv(master_csv, chunksize=chunk_size, low_memory=False)):
    total_rows += len(chunk)
    missing_counts += chunk.isnull().sum()
    
    # Sources
    if 'source' in chunk.columns:
        for s, count in chunk['source'].value_counts().items():
            sources[s] = sources.get(s, 0) + count
            
    # Chemistries
    if 'chemistry' in chunk.columns:
        for c, count in chunk['chemistry'].value_counts().items():
            chemistries[c] = chemistries.get(c, 0) + count
            
    # Cells
    if 'cell_id' in chunk.columns:
        chunk_cells = set(chunk['cell_id'].dropna().unique())
        cells.update(chunk_cells)
        
        # Source to cells
        if 'source' in chunk.columns:
            for s, sub_df in chunk.groupby('source'):
                if s not in source_cells:
                    source_cells[s] = set()
                source_cells[s].update(sub_df['cell_id'].unique())
                if s not in source_chem:
                    source_chem[s] = set()
                source_chem[s].update(sub_df['chemistry'].dropna().unique())
                
    # Target stats
    for t in ['target_soh', 'target_rul_cycles', 'target_cycles_to_knee']:
        if t in chunk.columns:
            valid = chunk[t].dropna()
            target_stats[t]['null'] += chunk[t].isnull().sum()
            target_stats[t]['count'] += len(valid)
            if len(valid) > 0:
                target_stats[t]['min'] = min(target_stats[t]['min'], float(valid.min()))
                target_stats[t]['max'] = max(target_stats[t]['max'], float(valid.max()))
                if 'rul' in t or 'knee' in t:
                    target_stats[t]['neg'] += int((valid < 0).sum())
                    
    print(f"Processed chunk {i+1}: running total rows = {total_rows:,}")

print(f"\nTOTAL ROWS IN master_dataset.csv: {total_rows:,}")
print(f"TOTAL UNIQUE CELLS: {len(cells)}")
print("\nSource Distribution (Rows & Cells):")
for s, count in sorted(sources.items(), key=lambda x: x[1], reverse=True):
    n_cells = len(source_cells.get(s, []))
    chems = list(source_chem.get(s, []))
    print(f"  - {s}: {count:,} rows ({count/total_rows*100:.2f}%), {n_cells} cells, Chemistries: {chems}")

print("\nChemistry Distribution:")
for c, count in sorted(chemistries.items(), key=lambda x: x[1], reverse=True):
    print(f"  - {c}: {count:,} rows ({count/total_rows*100:.2f}%)")

print("\nTarget Variable Distributions:")
for t, st in target_stats.items():
    print(f"  - {t}: Count={st['count']:,}, Nulls={st['null']:,}, Min={st['min']}, Max={st['max']}, Negatives={st.get('neg', 0)}")

# Check top columns with missing values
print("\nColumns with highest missing values:")
missing_pct = (missing_counts / total_rows) * 100
for col, pct in missing_pct.sort_values(ascending=False).head(20).items():
    print(f"  - {col}: {pct:.2f}% missing ({int(missing_counts[col]):,} nulls)")

# 2. AUDIT EV_BATTERY_HEALTH.CSV
print("\n--- 2. AUDITING EV_BATTERY_HEALTH.CSV ---")
fleet_df = pd.read_csv(fleet_csv)
print(f"Total rows in ev_battery_health.csv: {len(fleet_df):,}")
print(f"Total columns ({len(fleet_df.columns)}):", list(fleet_df.columns))
print("Chemistry breakdown:")
print(fleet_df['chemistry'].value_counts(dropna=False))
print("SOH min/max/mean:")
print(fleet_df['state_of_health_pct'].describe())

# 3. AUDIT BATTERY_DATASET1 and ARCHIVES
print("\n--- 3. AUDITING BATTERY_DATASET ARCHIVES ---")
for fn in ["battery_dataset1.tar", "battery_dataset1.tar.gz", "battery_dataset3.tar.gz"]:
    fp = os.path.join(ROOT_DIR, fn)
    if os.path.exists(fp):
        print(f"Archive: {fn}, size: {os.path.getsize(fp):,} bytes")

# Check if battery_dataset1/data has files
data_dir = os.path.join(ROOT_DIR, "battery_dataset1", "data")
if os.path.exists(data_dir):
    data_files = os.listdir(data_dir)
    print(f"battery_dataset1/data contains {len(data_files)} files. First 5: {data_files[:5]}")
    if len(data_files) > 0:
        first_pkl = os.path.join(data_dir, data_files[0])
        try:
            import pickle
            with open(first_pkl, "rb") as f:
                sample_data = pickle.load(f)
            print(f"Sample .pkl ({data_files[0]}) type: {type(sample_data)}")
            if isinstance(sample_data, dict):
                print("Keys:", list(sample_data.keys()))
            elif isinstance(sample_data, pd.DataFrame):
                print("DataFrame shape:", sample_data.shape, "Cols:", list(sample_data.columns))
        except Exception as e:
            print("Error loading sample pkl:", e)

label_file = os.path.join(ROOT_DIR, "battery_dataset1", "label", "label.csv")
if os.path.exists(label_file):
    print(f"label.csv size: {os.path.getsize(label_file)} bytes")

print("\n=== AUDIT RUN COMPLETED ===")
