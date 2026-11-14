import type { MeshPart, ParsedFeaMesh } from './mesh-viewport-mesh';
import type { MeshBounds } from './mesh-viewport-sync';
import type { MeshUpAxis } from './mesh-viewport-scene';
import type { MeshFormat } from './mesh-viewport-formats';

/** The model's parts; a file that names none is one part. */
export function modelParts(mesh: ParsedFeaMesh): MeshPart[] {
  return mesh.parts?.length
    ? mesh.parts
    : [
        {
          name: '',
          triangleStart: 0,
          triangleCount: mesh.triangles.length / 3,
          vertexStart: 0,
          vertexCount: mesh.positions.length / 3,
        },
      ];
}

/**
 * Vertex colours for the view: each part in the colour its file declares, otherwise the
 * next colour of `palette` (linear RGB triples, from the theme's chart tokens).
 */
export function partColors(
  mesh: ParsedFeaMesh,
  palette: readonly (readonly [number, number, number])[],
): Float32Array {
  const colors = new Float32Array(mesh.positions.length);
  let next = 0;
  for (const part of modelParts(mesh)) {
    const color = part.color ?? palette[next++ % Math.max(1, palette.length)] ?? [0.7, 0.7, 0.7];
    for (let v = part.vertexStart; v < part.vertexStart + part.vertexCount; v += 1)
      colors.set(color, v * 3);
  }
  return colors;
}

/** The box around the shown parts, or the whole model when none is hidden. */
export function shownBounds(
  mesh: ParsedFeaMesh,
  hidden: ReadonlySet<number>,
): MeshBounds | undefined {
  if (!hidden.size) return mesh.bounds;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  modelParts(mesh).forEach((part, index) => {
    if (hidden.has(index)) return;
    for (let v = part.vertexStart; v < part.vertexStart + part.vertexCount; v += 1)
      for (let axis = 0; axis < 3; axis += 1) {
        const value = mesh.positions[v * 3 + axis]!;
        if (value < min[axis]!) min[axis] = value;
        if (value > max[axis]!) max[axis] = value;
      }
  });
  return Number.isFinite(min[0]) ? { min, max } : undefined;
}

/** The box's extent along x, y and z, to one decimal: what a print plate is measured in. */
export function boxSize(bounds: MeshBounds): [string, string, string] {
  const extent = (axis: number) => (bounds.max[axis]! - bounds.min[axis]!).toFixed(1);
  return [extent(0), extent(1), extent(2)];
}

/** CAD exchange formats are Z-up; scene formats (glTF, OBJ, PLY) are Y-up. */
export function upAxisOf(format: MeshFormat): MeshUpAxis {
  return format === 'step' || format === 'stl' || format === '3mf' ? 'z' : 'y';
}

export type StandardView = 'iso' | 'top' | 'front' | 'right';

/** Where each standard view looks from (centre to camera) and its screen up, for `up`. */
export function standardViewFrame(
  view: Exclude<StandardView, 'iso'>,
  up: MeshUpAxis,
): { direction: [number, number, number]; up: [number, number, number] } {
  const z = up === 'z';
  const upVector: [number, number, number] = z ? [0, 0, 1] : [0, 1, 0];
  if (view === 'top') return { direction: upVector, up: z ? [0, 1, 0] : [0, 0, -1] };
  if (view === 'front') return { direction: z ? [0, -1, 0] : [0, 0, 1], up: upVector };
  return { direction: [1, 0, 0], up: upVector };
}
