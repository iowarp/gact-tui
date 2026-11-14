import type { ParsedFeaMesh } from './mesh-viewport-mesh';
import type { MeshBounds } from './mesh-viewport-sync';
import { modelParts } from './cad-view-model';

export type Vec3 = [number, number, number];

/** What the view states about one part: its box, size, triangles and area-weighted centre. */
export interface PartFacts {
  index: number;
  name: string;
  bounds: MeshBounds;
  /** Extent along x, y and z in millimetres. */
  size: Vec3;
  triangles: number;
  /** The surface's area-weighted centroid (the box centre for a part without area). */
  centroid: Vec3;
}

/** The box's extent along x, y and z, as numbers. */
export function boxExtent(bounds: MeshBounds): Vec3 {
  return [0, 1, 2].map((axis) => bounds.max[axis]! - bounds.min[axis]!) as Vec3;
}

export function boxCenter(bounds: MeshBounds): Vec3 {
  return [0, 1, 2].map((axis) => (bounds.min[axis]! + bounds.max[axis]!) / 2) as Vec3;
}

/** The box around every vertex the part's triangles use. */
function partBounds(mesh: ParsedFeaMesh, start: number, count: number): MeshBounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const { positions, triangles } = mesh;
  for (let i = start * 3; i < (start + count) * 3; i += 1) {
    const v = triangles[i]! * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[v + axis]!;
      if (value < min[axis]!) min[axis] = value;
      if (value > max[axis]!) max[axis] = value;
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
}

/** The facts of every part, in the model's part order. */
export function partFacts(mesh: ParsedFeaMesh): PartFacts[] {
  const { positions, triangles } = mesh;
  return modelParts(mesh).map((part, index) => {
    const bounds = partBounds(mesh, part.triangleStart, part.triangleCount);
    let area = 0;
    const sum: Vec3 = [0, 0, 0];
    for (let t = part.triangleStart; t < part.triangleStart + part.triangleCount; t += 1) {
      const a = triangles[t * 3]! * 3;
      const b = triangles[t * 3 + 1]! * 3;
      const c = triangles[t * 3 + 2]! * 3;
      const ab = [0, 1, 2].map((k) => positions[b + k]! - positions[a + k]!);
      const ac = [0, 1, 2].map((k) => positions[c + k]! - positions[a + k]!);
      const cross = [
        ab[1]! * ac[2]! - ab[2]! * ac[1]!,
        ab[2]! * ac[0]! - ab[0]! * ac[2]!,
        ab[0]! * ac[1]! - ab[1]! * ac[0]!,
      ];
      const weight = Math.hypot(cross[0]!, cross[1]!, cross[2]!) / 2;
      area += weight;
      for (let k = 0; k < 3; k += 1)
        sum[k] += (weight * (positions[a + k]! + positions[b + k]! + positions[c + k]!)) / 3;
    }
    const centroid: Vec3 = area > 0 ? (sum.map((value) => value / area) as Vec3) : boxCenter(bounds);
    return {
      index,
      name: part.name,
      bounds,
      size: boxExtent(bounds),
      triangles: part.triangleCount,
      centroid,
    };
  });
}

/** The box around the given parts' boxes, each moved by its offset; undefined for none. */
export function unionBounds(
  facts: readonly PartFacts[],
  include: (index: number) => boolean,
  offsets?: readonly Vec3[],
): MeshBounds | undefined {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const part of facts) {
    if (!include(part.index)) continue;
    const offset = offsets?.[part.index] ?? [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, part.bounds.min[axis]! + offset[axis]!);
      max[axis] = Math.max(max[axis]!, part.bounds.max[axis]! + offset[axis]!);
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : undefined;
}

/** The box around two boxes. */
export function unionBox(a: MeshBounds, b: MeshBounds): MeshBounds {
  return {
    min: [0, 1, 2].map((k) => Math.min(a.min[k]!, b.min[k]!)) as Vec3,
    max: [0, 1, 2].map((k) => Math.max(a.max[k]!, b.max[k]!)) as Vec3,
  };
}
