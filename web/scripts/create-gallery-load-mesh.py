"""Build the gallery's illustrative load-field GLB with only the standard library.

The shape echoes a waisted test specimen. Values are synthetic and dimensionless;
the asset demonstrates the viewport contract, not a computed Abaqus result.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path


def pad(data: bytes, fill: bytes = b"\0") -> bytes:
    """Align a GLB chunk or buffer view to four bytes."""
    return data + fill * ((-len(data)) % 4)


def make_mesh() -> tuple[list[float], list[int], list[float]]:
    """Return positions, triangles, and a synthetic relative-load field."""
    rings = 64
    sides = 40
    positions: list[float] = []
    values: list[float] = []
    for ring in range(rings + 1):
        t = ring / rings
        y = (t - 0.5) * 4.2
        waist = math.exp(-(((t - 0.5) / 0.18) ** 2))
        radius = 0.9 - 0.48 * waist
        for side in range(sides):
            angle = 2 * math.pi * side / sides
            x = radius * math.cos(angle)
            z = 0.72 * radius * math.sin(angle)
            positions.extend((x, y, z))
            flank = 0.78 + 0.22 * max(0.0, math.cos(angle - 0.7))
            values.append(0.08 + 0.88 * waist * flank)
    triangles: list[int] = []
    for ring in range(rings):
        for side in range(sides):
            a = ring * sides + side
            b = ring * sides + (side + 1) % sides
            c = (ring + 1) * sides + side
            d = (ring + 1) * sides + (side + 1) % sides
            triangles.extend((a, b, c, b, d, c))
    return positions, triangles, values


def build_glb() -> bytes:
    """Serialize a self-contained CLIO field mesh for the gallery."""
    positions, triangles, values = make_mesh()
    chunks = [
        struct.pack(f"<{len(positions)}f", *positions),
        struct.pack(f"<{len(triangles)}H", *triangles),
        struct.pack(f"<{len(values)}f", *values),
    ]
    views = []
    binary = b""
    for chunk, target in zip(chunks, (34962, 34963, 34962), strict=True):
        views.append(
            {
                "buffer": 0,
                "byteOffset": len(binary),
                "byteLength": len(chunk),
                "target": target,
            }
        )
        binary += pad(chunk)
    count = len(values)
    document = {
        "asset": {"version": "2.0", "generator": "CLIO illustrative gallery mesh"},
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": views,
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": count,
                "type": "VEC3",
                "min": [-0.9, -2.1, -0.648],
                "max": [0.9, 2.1, 0.648],
            },
            {
                "bufferView": 1,
                "componentType": 5123,
                "count": len(triangles),
                "type": "SCALAR",
            },
            {
                "bufferView": 2,
                "componentType": 5126,
                "count": count,
                "type": "SCALAR",
                "min": [min(values)],
                "max": [max(values)],
            },
        ],
        "meshes": [
            {
                "primitives": [
                    {"attributes": {"POSITION": 0}, "indices": 1, "material": 0}
                ]
            }
        ],
        "materials": [
            {
                "doubleSided": True,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1, 1, 1, 1],
                    "metallicFactor": 0,
                    "roughnessFactor": 0.7,
                },
            }
        ],
        "nodes": [{"mesh": 0}],
        "scenes": [
            {
                "nodes": [0],
                "extras": {
                    "clio": {
                        "contract": "clio.fea-mesh.v1",
                        "stage": "illustrative",
                        "topology": "surface",
                        "fields": [
                            {
                                "name": "relative_load",
                                "label": "Relative load",
                                "unit": "",
                                "location": "node",
                                "count": count,
                                "frames": 1,
                                "accessor": 2,
                            }
                        ],
                        "frames": [{"label": "Illustrative field"}],
                    }
                },
            }
        ],
        "scene": 0,
    }
    json_chunk = pad(json.dumps(document, separators=(",", ":")).encode("utf-8"), b" ")
    body = struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk
    body += struct.pack("<I4s", len(binary), b"BIN\0") + binary
    return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body


def main() -> None:
    """Write the mesh and its matching chart profile from one source."""
    web = Path(__file__).resolve().parents[1]
    target = web / "public" / "gallery" / "load-specimen.glb"
    target.write_bytes(build_glb())
    positions, _, values = make_mesh()
    profile = []
    for ring in range(65):
        start = ring * 40
        level = sum(values[start : start + 40]) / 40
        profile.append(
            {
                "__row": ring,
                "id": f"level-{ring:02d}",
                "height": round(positions[start * 3 + 1], 3),
                "relative_load": round(level, 4),
                "zone": "Waist" if level >= 0.4 else "Ends",
            }
        )
    (web / "src" / "lib" / "gallery-load-profile.json").write_text(
        json.dumps(profile, separators=(",", ":")) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
