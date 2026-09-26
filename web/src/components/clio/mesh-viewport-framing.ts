import * as THREE from 'three';
import type { MeshBounds } from './mesh-viewport-sync';

/** Empty space left around the part when it is framed, as a fraction of the fit distance. */
const FIT_MARGIN = 1.08;

export interface FramingResult {
  center: THREE.Vector3;
  /** Camera distance from `center` along the view direction. */
  distance: number;
  /** Radius of the box's bounding sphere, for near/far planes. */
  radius: number;
}

/**
 * Distance at which a perspective camera looking at the box centre along
 * `direction` (unit, pointing from the centre to the camera) shows the whole
 * box.
 *
 * The bounding sphere gives a distance that always fits, using the narrower of
 * the vertical and horizontal fields of view. For a slender part that sphere
 * is far larger than what the camera actually sees, so the distance is then
 * tightened to the smallest one at which all eight box corners project inside
 * the view; it never exceeds the sphere fit.
 */
export function fitBoxDistance(
  bounds: MeshBounds,
  direction: THREE.Vector3,
  up: THREE.Vector3,
  fovDegrees: number,
  aspect: number,
): FramingResult {
  const box = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max));
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-6);
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDegrees / 2));
  const tanH = tanV * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1);
  const halfFov = Math.atan(Math.min(tanV, tanH));
  const sphere = radius / Math.sin(halfFov);

  const toCamera = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(up, toCamera).normalize();
  if (right.lengthSq() === 0) return { center, distance: sphere * FIT_MARGIN, radius };
  const viewUp = new THREE.Vector3().crossVectors(toCamera, right).normalize();
  let corners = 0;
  const rel = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        rel.set(x, y, z).sub(center);
        const depth = rel.dot(toCamera);
        corners = Math.max(
          corners,
          depth + Math.abs(rel.dot(right)) / tanH,
          depth + Math.abs(rel.dot(viewUp)) / tanV,
        );
      }
  return { center, distance: Math.min(sphere, corners) * FIT_MARGIN, radius };
}
