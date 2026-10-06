"""Record h5grove responses for e2e/hdf5-viewer.spec.ts.

Writes a small NeXus-shaped water.h5, serves it through the HDF Group data
route (clio-kit's hdf5_mcp.provider.routes, the server side of the viewer),
and saves each response h5web needs to water-h5grove.json, keyed by endpoint
and parameters minus `file`. Run with clio-kit's hdf5 environment:

    cd clio-kit/clio-kit-mcp-servers/hdf5
    uv run --extra data-routes python \\
        ../../../gact-tui/web/e2e/fixtures/hdf5/record_h5grove.py
"""

import base64
import json
import tempfile
from pathlib import Path
from urllib.parse import urlencode

import h5py
import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hdf5_mcp.provider.routes import base_dir_resolver, create_router

OUT = Path(__file__).with_name("water-h5grove.json")

REQUESTS = [
    ("meta", {"path": "/"}),
    ("attr", {"path": "/"}),
    ("meta", {"path": "/entry"}),
    ("attr", {"path": "/entry"}),
    ("meta", {"path": "/entry/results"}),
    ("attr", {"path": "/entry/results"}),
    ("attr", {"path": "/entry/results/I"}),
    ("attr", {"path": "/entry/results/q"}),
    ("attr", {"path": "/entry/image"}),
    ("data", {"path": "/entry/results/I", "format": "bin", "dtype": "safe"}),
    ("data", {"path": "/entry/results/q", "format": "bin", "dtype": "safe"}),
    ("data", {"path": "/entry/image", "format": "bin", "dtype": "safe"}),
]


def key(endpoint: str, params: dict[str, str]) -> str:
    """Same key as the spec: endpoint, then sorted parameters without `file`."""
    rest = sorted((k, v) for k, v in params.items() if k != "file")
    return f"{endpoint}?{urlencode(rest)}"


def write_file(path: Path) -> None:
    with h5py.File(path, "w") as f:
        f.attrs["default"] = "entry"
        entry = f.create_group("entry")
        entry.attrs["NX_class"] = "NXentry"
        entry.attrs["default"] = "results"
        results = entry.create_group("results")
        results.attrs["NX_class"] = "NXdata"
        results.attrs["signal"] = "I"
        results.attrs["axes"] = "q"
        q = np.linspace(0.1, 5, 200)
        results["q"] = q
        results["q"].attrs["units"] = "1/nm"
        results["I"] = np.exp(-q) * 1000 + 50 * np.sin(4 * q) + 100
        results["I"].attrs["units"] = "counts"
        yy, xx = np.mgrid[0:48, 0:48]
        entry["image"] = (np.sin(xx / 6.0) * np.cos(yy / 9.0) * 100).astype("f4")


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        write_file(Path(tmp) / "water.h5")
        app = FastAPI()
        app.include_router(create_router(base_dir_resolver(tmp)), prefix="/h5grove")
        client = TestClient(app)
        recorded = {}
        for endpoint, params in REQUESTS:
            response = client.get(
                f"/h5grove/{endpoint}", params={"file": "water.h5", **params}
            )
            response.raise_for_status()
            recorded[key(endpoint, params)] = {
                "status": response.status_code,
                "contentType": response.headers["content-type"],
                "body": base64.b64encode(response.content).decode(),
            }
    OUT.write_text(json.dumps(recorded, indent=1, sort_keys=True) + "\n")
    print(f"wrote {len(recorded)} responses to {OUT}")


if __name__ == "__main__":
    main()
