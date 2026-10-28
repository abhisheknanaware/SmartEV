import os
import sys

csv_path = r"d:\EVFINAL\master_dataset_clean.csv"
print(f"Size: {os.path.getsize(csv_path):,} bytes", flush=True)

with open(csv_path, "r", encoding="utf-8", errors="ignore") as f:
    for i in range(10):
        line = f.readline()
        print(f"Line {i+1}: {line[:60]}...", flush=True)
print("Finished reading 10 lines successfully!", flush=True)
