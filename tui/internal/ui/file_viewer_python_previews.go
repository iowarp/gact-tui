package ui

// file_viewer_python_previews.go holds the embedded Python scripts used to preview parquet/HDF5/numpy files.

func parquetPreviewPython() string {
	return `
import sys
path = sys.argv[1]
try:
    import pyarrow as pa
    import pyarrow.parquet as pq
except Exception as exc:
    raise SystemExit(f"pyarrow unavailable: {exc}")

if path.lower().endswith(".parquet"):
    pf = pq.ParquetFile(path)
    print(f"parquet rows: {pf.metadata.num_rows}")
    print(f"row groups: {pf.metadata.num_row_groups}")
    print(f"columns: {pf.metadata.num_columns}")
    print()
    print(pf.schema)
    print()
    table = pf.read_row_group(0, columns=pf.schema.names[: min(8, len(pf.schema.names))])
else:
    table = pa.ipc.open_file(path).read_all()
    print(f"arrow rows: {table.num_rows}")
    print(f"columns: {table.num_columns}")
    print()
    print(table.schema)
    print()
print(table.slice(0, 20).to_pandas().to_string(index=False))
`
}

func hdf5PreviewPython() string {
	return `
import sys
path = sys.argv[1]
try:
    import h5py
except Exception as exc:
    raise SystemExit(f"h5py unavailable: {exc}")

with h5py.File(path, "r") as f:
    rows = []
    def visit(name, obj):
        kind = "group" if isinstance(obj, h5py.Group) else "dataset"
        if isinstance(obj, h5py.Dataset):
            rows.append(f"{name}  {kind}  shape={obj.shape} dtype={obj.dtype}")
        else:
            rows.append(f"{name}  {kind}")
    f.visititems(visit)
    print("hdf5 tree:")
    for row in rows[:200]:
        print(row)
    if len(rows) > 200:
        print(f"... {len(rows)-200} more objects")
`
}

func numpyPreviewPython() string {
	return `
import sys
path = sys.argv[1]
try:
    import numpy as np
except Exception as exc:
    raise SystemExit(f"numpy unavailable: {exc}")

obj = np.load(path, allow_pickle=False)
if hasattr(obj, "files"):
    print("npz archive:")
    for name in obj.files:
        arr = obj[name]
        print(f"{name}: shape={arr.shape} dtype={arr.dtype}")
        print(arr.reshape(-1)[:12])
else:
    arr = obj
    print(f"array: shape={arr.shape} dtype={arr.dtype}")
    print(arr.reshape(-1)[:24])
`
}
