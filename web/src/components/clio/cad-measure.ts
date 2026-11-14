import type { Vec3 } from './cad-parts';

/** What a measuring pick landed on: a corner, an edge or a face. */
export type SnapKind = 'vertex' | 'edge' | 'face';

export interface SnapPoint {
  kind: SnapKind;
  point: Vec3;
  /** The edge segment an edge snap lies on (index into the segment list). */
  segment?: number;
}

export interface SnapInput {
  /** Where the pick ray met the face. */
  hit: Vec3;
  /**
   * Feature-edge segments to snap to, six numbers (two points) per segment, in the same
   * space as `hit`.
   */
  segments: ArrayLike<number>;
  /** Screen position of a model point, in pixels; undefined behind the camera. */
  project: (point: Vec3) => [number, number] | undefined;
  /** The pointer, in the same pixels. */
  pointer: [number, number];
  /** How close (pixels) the pointer must be to snap. */
  radius: number;
  /**
   * Distance of a point from the camera along the view, with how far behind the picked
   * surface a corner or edge may lie and still snap; one farther back is hidden by it.
   */
  occlusion?: { depth: (point: Vec3) => number; tolerance: number };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + (b[0] - a[0]) * s,
  a[1] + (b[1] - a[1]) * s,
  a[2] + (b[2] - a[2]) * s,
];

function segmentAt(segments: ArrayLike<number>, index: number): [Vec3, Vec3] {
  const o = index * 6;
  return [
    [segments[o]!, segments[o + 1]!, segments[o + 2]!],
    [segments[o + 3]!, segments[o + 4]!, segments[o + 5]!],
  ];
}

/**
 * Snap a pick to the nearest corner (an end of a feature edge), else the nearest point on a
 * feature edge, within `radius` pixels of the pointer; otherwise the face point itself.
 * Corners win over edges, as in CAD tools, so a corner is easy to hit.
 */
export function snapPoint({ hit, segments, project, pointer, radius, occlusion }: SnapInput): SnapPoint {
  const count = Math.floor(segments.length / 6);
  const limit = occlusion ? occlusion.depth(hit) + occlusion.tolerance : Infinity;
  const hidden = (point: Vec3) => (occlusion ? occlusion.depth(point) > limit : false);
  const [px, py] = pointer;
  let vertex: SnapPoint | undefined;
  let vertexDistance = radius;
  let edge: SnapPoint | undefined;
  let edgeDistance = radius;
  for (let s = 0; s < count; s += 1) {
    const [a, b] = segmentAt(segments, s);
    const sa = project(a);
    const sb = project(b);
    if (!sa || !sb) continue;
    for (const [point, screen] of [
      [a, sa],
      [b, sb],
    ] as const) {
      const distance = Math.hypot(screen[0] - px, screen[1] - py);
      if (distance <= vertexDistance && !hidden(point)) {
        vertexDistance = distance;
        vertex = { kind: 'vertex', point, segment: s };
      }
    }
    const dx = sb[0] - sa[0];
    const dy = sb[1] - sa[1];
    const span = dx * dx + dy * dy;
    const along = span > 0 ? Math.min(1, Math.max(0, ((px - sa[0]) * dx + (py - sa[1]) * dy) / span)) : 0;
    const distance = Math.hypot(sa[0] + dx * along - px, sa[1] + dy * along - py);
    const point = lerp(a, b, along);
    if (distance <= edgeDistance && !hidden(point)) {
      edgeDistance = distance;
      edge = { kind: 'edge', point, segment: s };
    }
  }
  return vertex ?? edge ?? { kind: 'face', point: hit };
}

export interface Distance {
  distance: number;
  /** The absolute extent along x, y and z. */
  delta: Vec3;
}

export function measureDistance(a: Vec3, b: Vec3): Distance {
  const d = sub(b, a);
  return { distance: length(d), delta: d.map(Math.abs) as Vec3 };
}

/** The angle between two faces' planes, from their normals: 0° parallel, 90° square. */
export function faceAngle(n1: Vec3, n2: Vec3): number {
  const l = length(n1) * length(n2);
  if (l === 0) return 0;
  const cosine = Math.min(1, Math.abs(dot(n1, n2)) / l);
  return (Math.acos(cosine) * 180) / Math.PI;
}

/**
 * The connected chain of feature-edge segments through `start`, followed while each step
 * turns less than `maxTurn` degrees, as an ordered list of points. A hole's rim comes back
 * as its ring of points; a box edge stops at the corners.
 */
export function edgeChain(segments: ArrayLike<number>, start: number, maxTurn = 50): Vec3[] {
  const count = Math.floor(segments.length / 6);
  if (start < 0 || start >= count) return [];
  const [first, last] = segmentAt(segments, start);
  const scale = Math.max(length(sub(last, first)), 1e-9);
  const key = (p: Vec3) => p.map((value) => Math.round(value / (scale * 1e-3))).join(',');
  const ends = new Map<string, number[]>();
  for (let s = 0; s < count; s += 1) {
    const [a, b] = segmentAt(segments, s);
    for (const point of [a, b]) {
      const k = key(point);
      const list = ends.get(k);
      if (list) list.push(s);
      else ends.set(k, [s]);
    }
  }
  const cosLimit = Math.cos((maxTurn * Math.PI) / 180);
  const used = new Set([start]);
  const walk = (from: Vec3, at: Vec3): Vec3[] => {
    const out: Vec3[] = [];
    let previous = from;
    let current = at;
    for (let step = 0; step < 4096; step += 1) {
      const heading = sub(current, previous);
      let best: { segment: number; next: Vec3; turn: number } | undefined;
      for (const s of ends.get(key(current)) ?? []) {
        if (used.has(s)) continue;
        const [a, b] = segmentAt(segments, s);
        const next = key(a) === key(current) ? b : a;
        const direction = sub(next, current);
        const turn = dot(heading, direction) / Math.max(length(heading) * length(direction), 1e-12);
        if (turn >= cosLimit && (!best || turn > best.turn)) best = { segment: s, next, turn };
      }
      if (!best) break;
      used.add(best.segment);
      out.push(best.next);
      previous = current;
      current = best.next;
    }
    return out;
  };
  const forward = walk(first, last);
  const closed = forward.length > 0 && key(forward[forward.length - 1]!) === key(first);
  if (closed) return [first, last, ...forward.slice(0, -1)];
  const backward = walk(last, first);
  return [...backward.reverse(), first, last, ...forward];
}

export interface CircleFit {
  center: Vec3;
  radius: number;
  /** Unit normal of the circle's plane. */
  normal: Vec3;
}

/** The circle through three points, if they are not in a line. */
function circleThrough(a: Vec3, b: Vec3, c: Vec3): CircleFit | undefined {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const normal = cross(ab, ac);
  const n2 = dot(normal, normal);
  if (n2 < 1e-18) return undefined;
  // Circumcentre: a + ((|ac|² (n × ab)) + (|ab|² (ac × n))) / (2 |n|²).
  const t1 = cross(normal, ab).map((value) => value * dot(ac, ac));
  const t2 = cross(ac, normal).map((value) => value * dot(ab, ab));
  const offset = [0, 1, 2].map((k) => (t1[k]! + t2[k]!) / (2 * n2)) as Vec3;
  const nl = Math.sqrt(n2);
  return {
    center: [a[0] + offset[0], a[1] + offset[1], a[2] + offset[2]],
    radius: length(offset),
    normal: normal.map((value) => value / nl) as Vec3,
  };
}

/**
 * A circle through an edge chain's points when they lie on one (within `tolerance` of the
 * radius, in its plane); undefined for a straight or irregular chain. Needs four points.
 */
export function fitCircle(points: readonly Vec3[], tolerance = 0.02): CircleFit | undefined {
  if (points.length < 4) return undefined;
  const n = points.length;
  const circle = circleThrough(points[0]!, points[Math.floor(n / 3)]!, points[Math.floor((2 * n) / 3)]!);
  if (!circle || !Number.isFinite(circle.radius)) return undefined;
  const limit = circle.radius * tolerance;
  for (const point of points) {
    const rel = sub(point, circle.center);
    if (Math.abs(dot(rel, circle.normal)) > limit) return undefined;
    if (Math.abs(length(rel) - circle.radius) > limit) return undefined;
  }
  return circle;
}
