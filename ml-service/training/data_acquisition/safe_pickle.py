"""Inspect and load untrusted pickle files safely.

`scan_globals` lists every class/function a pickle references using
pickletools (no code is executed). `safe_load` only resolves an allow-list
of plain data types, so a malicious pickle cannot run code.
"""
import io
import pickle
import pickletools
from collections import Counter

ALLOWED = {
    ("builtins", "dict"), ("builtins", "list"), ("builtins", "tuple"), ("builtins", "set"),
    ("builtins", "frozenset"), ("builtins", "bytearray"), ("builtins", "slice"), ("builtins", "complex"),
    ("collections", "OrderedDict"), ("collections", "defaultdict"),
    ("numpy", "ndarray"), ("numpy", "dtype"), ("numpy.core.multiarray", "_reconstruct"),
    ("numpy._core.multiarray", "_reconstruct"), ("numpy.core.multiarray", "scalar"),
    ("numpy._core.multiarray", "scalar"), ("numpy", "float64"), ("numpy", "int64"),
    ("_codecs", "encode"),
}


def scan_globals(data: bytes) -> Counter:
    found = Counter()
    pending = []
    for op, arg, _ in pickletools.genops(data):
        if op.name in ("SHORT_BINUNICODE", "BINUNICODE", "UNICODE", "BINUNICODE8"):
            pending.append(arg)
            pending = pending[-2:]
        elif op.name == "GLOBAL":
            module, name = arg.split(" ", 1)
            found[(module, name)] += 1
        elif op.name == "STACK_GLOBAL" and len(pending) == 2:
            found[(pending[0], pending[1])] += 1
    return found


class _RestrictedUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if (module, name) in ALLOWED:
            return super().find_class(module, name)
        raise pickle.UnpicklingError(f"blocked: {module}.{name}")


def safe_load(data: bytes):
    return _RestrictedUnpickler(io.BytesIO(data)).load()
