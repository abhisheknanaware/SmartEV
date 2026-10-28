"""Safely unpack the raw battery datasets into datasets/extracted/<source>/.

Rejects archive members with absolute paths or '..' (path traversal) and
unpacks nested zips (NASA ships zips inside a zip).

Usage: python -I extract.py "C:/Users/abhis/Documents/Ai ev/datasets"
"""
import sys
import zipfile
from pathlib import Path

import py7zr

ARCHIVES = {
    "calce": ["CALCE.zip"],
    "snl": ["SNL.zip"],
    "hust": ["HUST.zip"],
    "matr": ["MATR.zip"],
    "nasa": ["5_Battery_Data_Set.zip"],
    "ved": ["VED_DynamicData_Part1.7z", "VED_DynamicData_Part2.7z"],
    "batterylife_docs": ["READMEs.zip", "Life labels.zip"],
}
COPY_AS_IS = {"oxford": ["Oxford_Battery_Degradation_Dataset_1.mat", "ExampleDC_C1.mat", "Readme.txt"],
              "ved": ["VED_Static_Data_ICE&HEV.xlsx", "VED_Static_Data_PHEV&EV.xlsx"]}


def is_safe(dest: Path, member: str) -> bool:
    target = (dest / member).resolve()
    return str(target).startswith(str(dest.resolve())) and not Path(member).is_absolute()


def extract_zip(archive: Path, dest: Path) -> int:
    with zipfile.ZipFile(archive) as z:
        bad = [m for m in z.namelist() if not is_safe(dest, m)]
        if bad:
            raise ValueError(f"{archive.name}: unsafe paths {bad[:3]}")
        z.extractall(dest)
        count = len(z.namelist())
    for inner in sorted(dest.rglob("*.zip")):
        inner_dest = inner.with_suffix("")
        if not inner_dest.exists():
            count += extract_zip(inner, inner_dest)
    return count


def extract_7z(archive: Path, dest: Path) -> int:
    with py7zr.SevenZipFile(archive) as z:
        names = z.getnames()
        bad = [m for m in names if not is_safe(dest, m)]
        if bad:
            raise ValueError(f"{archive.name}: unsafe paths {bad[:3]}")
        z.extractall(dest)
    return len(names)


def main(root: Path) -> None:
    raw, out = root / "raw", root / "extracted"
    for source, files in ARCHIVES.items():
        dest = out / source
        dest.mkdir(parents=True, exist_ok=True)
        for name in files:
            archive = raw / source / name
            n = extract_7z(archive, dest) if archive.suffix == ".7z" else extract_zip(archive, dest)
            print(f"{source:<17} {name:<28} {n:>5} entries", flush=True)
    for source, files in COPY_AS_IS.items():
        dest = out / source
        dest.mkdir(parents=True, exist_ok=True)
        for name in files:
            target = dest / name
            if not target.exists():
                target.write_bytes((raw / source / name).read_bytes())
            print(f"{source:<17} {name:<28} copied", flush=True)
    print("EXTRACTION DONE", flush=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
