# Regenerate with: uv run --python 3.12 --with cadquery python generate.py <this folder>
"""Generate the two-part STEP fixture: a 20x12x6 mm block and a 3 mm-radius, 10 mm peg on top."""
import sys
import cadquery as cq

out = sys.argv[1]
base = cq.Workplane("XY").box(20, 12, 6, centered=(True, True, False))
peg = cq.Workplane("XY").circle(3).extrude(10).translate((0, 0, 6))
assy = cq.Assembly(name="fixture")
assy.add(base, name="base", color=cq.Color(0.2, 0.45, 0.8))
assy.add(peg, name="peg", color=cq.Color(0.85, 0.4, 0.15))
assy.save(out + "/two-part.step")
cq.exporters.export(base, out + "/block-binary.stl", tolerance=0.2, angularTolerance=0.5)
