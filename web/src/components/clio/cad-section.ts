import type { Vec3 } from './cad-parts';
import type { MeshBounds } from './mesh-viewport-sync';

export type SectionAxis = 'x' | 'y' | 'z';

const AXIS_INDEX: Record<SectionAxis, number> = { x: 0, y: 1, z: 2 };

/**
 * A section plane across one axis. Unflipped, the view keeps what lies at or below
 * `position` along the axis and cuts away the rest; flipped keeps the other side.
 */
export interface SectionState {
  axis: SectionAxis;
  /** Where the plane crosses the axis, in model millimetres. */
  position: number;
  flipped: boolean;
}

/** The plane in three.js form: points with `normal · p + constant >= 0` are kept. */
export interface SectionPlane {
  normal: Vec3;
  constant: number;
}

export function axisIndex(axis: SectionAxis): number {
  return AXIS_INDEX[axis];
}

/** The range a section on `axis` can take: the model's extent along it. */
export function sectionRange(bounds: MeshBounds, axis: SectionAxis): [number, number] {
  const index = AXIS_INDEX[axis];
  return [bounds.min[index]!, bounds.max[index]!];
}

/** A plane through the middle of the model across `axis`. */
export function defaultSection(bounds: MeshBounds, axis: SectionAxis): SectionState {
  const [min, max] = sectionRange(bounds, axis);
  return { axis, position: (min + max) / 2, flipped: false };
}

/** The same section kept within the model's extent (after an explode or a hidden part). */
export function clampSection(state: SectionState, bounds: MeshBounds): SectionState {
  const [min, max] = sectionRange(bounds, state.axis);
  const position = Math.min(max, Math.max(min, state.position));
  return position === state.position ? state : { ...state, position };
}

/** Change the axis: the plane starts again through the middle, the flip is kept. */
export function withAxis(state: SectionState, axis: SectionAxis, bounds: MeshBounds): SectionState {
  if (axis === state.axis) return state;
  return { ...defaultSection(bounds, axis), flipped: state.flipped };
}

export function sectionPlane(state: SectionState): SectionPlane {
  const normal: Vec3 = [0, 0, 0];
  const sign = state.flipped ? 1 : -1;
  normal[AXIS_INDEX[state.axis]] = sign;
  return { normal, constant: -sign * state.position };
}

/** Whether the section keeps `point`. */
export function keepsPoint(state: SectionState, point: Vec3): boolean {
  const { normal, constant } = sectionPlane(state);
  return normal[0] * point[0] + normal[1] * point[1] + normal[2] * point[2] + constant >= 0;
}

/**
 * The plane's outline: the model box's cross-section at the plane, 5 % larger on each side,
 * as four corners in drawing order.
 */
export function sectionOutline(state: SectionState, bounds: MeshBounds): Vec3[] {
  const index = AXIS_INDEX[state.axis];
  const [u, v] = [0, 1, 2].filter((axis) => axis !== index) as [number, number];
  const pad = (axis: number) => (bounds.max[axis]! - bounds.min[axis]!) * 0.05 || 1;
  const lo = (axis: number) => bounds.min[axis]! - pad(axis);
  const hi = (axis: number) => bounds.max[axis]! + pad(axis);
  const corner = (a: number, b: number): Vec3 => {
    const point: Vec3 = [0, 0, 0];
    point[index] = state.position;
    point[u] = a;
    point[v] = b;
    return point;
  };
  return [
    corner(lo(u), lo(v)),
    corner(hi(u), lo(v)),
    corner(hi(u), hi(v)),
    corner(lo(u), hi(v)),
  ];
}
