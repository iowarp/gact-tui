import { boxCenter, boxExtent, type PartFacts, type Vec3 } from './cad-parts';
import type { MeshBounds } from './mesh-viewport-sync';

/**
 * How far each part moves in an exploded view. Every part moves away from the assembly's
 * centre along the direction of its own centroid, by `amount` (0 to 1) of the model's
 * diagonal, so parts of any size separate by the same distance. A part whose centroid sits
 * on the centre has no direction of its own and moves along the model's up axis.
 */
export function explodeOffsets(
  facts: readonly Pick<PartFacts, 'centroid'>[],
  bounds: MeshBounds,
  amount: number,
  up: Vec3,
): Vec3[] {
  const center = boxCenter(bounds);
  const [x, y, z] = boxExtent(bounds);
  const diagonal = Math.hypot(x, y, z);
  const distance = Math.max(0, amount) * diagonal;
  return facts.map(({ centroid }) => {
    if (facts.length < 2 || distance === 0) return [0, 0, 0];
    const away = centroid.map((value, axis) => value - center[axis]!) as Vec3;
    const length = Math.hypot(...away);
    const direction = length > diagonal * 1e-6 ? away.map((value) => value / length) : up;
    return direction.map((value) => value * distance) as Vec3;
  });
}

/** Whether an offset list moves anything. */
export function isExploded(offsets: readonly Vec3[]): boolean {
  return offsets.some((offset) => offset.some((value) => value !== 0));
}
