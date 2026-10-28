import os
import sys

csv_path = r"d:\EVFINAL\master_dataset.csv"
size = os.path.getsize(csv_path)
print(f"File size: {size:,} bytes", flush=True)

with open(csv_path, 'rb') as f:
    # Read first 5 lines
    for i in range(5):
        line = f.readline()
        print(f"Line {i+1} ({len(line)} bytes): {line[:80]}", flush=True)

    # Let's count total lines by reading in 1MB blocks
    f.seek(0)
    newlines = 0
    null_bytes = 0
    sample_after_10600 = None
    bytes_read = 0
    current_line = 0

    while True:
        chunk = f.read(1024 * 1024)
        if not chunk:
            break
        bytes_read += len(chunk)
        newlines += chunk.count(b'\n')
        null_bytes += chunk.count(b'\x00')
        
    print(f"Total \\n in file: {newlines:,}", flush=True)
    print(f"Total \\x00 in file: {null_bytes:,}", flush=True)
    print(f"Total bytes read: {bytes_read:,}", flush=True)
