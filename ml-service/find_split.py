import os
import sys

csv_path = r"d:\EVFINAL\master_dataset.csv"
file_size = os.path.getsize(csv_path)
print(f"File size: {file_size:,} bytes", flush=True)

with open(csv_path, "rb") as f:
    # Read in 512KB blocks and see when null bytes first appear
    block_size = 512 * 1024
    pos = 0
    first_null_pos = None
    
    while True:
        data = f.read(block_size)
        if not data:
            break
        idx = data.find(b"\x00")
        if idx != -1:
            first_null_pos = pos + idx
            break
        pos += len(data)

print(f"First null byte is at byte offset: {first_null_pos:,}", flush=True)
print(f"Text portion size: {first_null_pos:,} bytes ({first_null_pos / 1024 / 1024:.2f} MB)", flush=True)
print(f"Null portion size: {file_size - first_null_pos:,} bytes ({(file_size - first_null_pos) / 1024 / 1024:.2f} MB)", flush=True)

with open(csv_path, "rb") as f:
    f.seek(max(0, first_null_pos - 300))
    context = f.read(300)
    print("End of text before nulls:", repr(context[-200:]), flush=True)
