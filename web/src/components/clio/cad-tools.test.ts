import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { explodeOffsets, isExploded } from './cad-explode';
import { edgeChain, faceAngle, fitCircle, measureDistance, snapPoint } from './cad-measure';
import { partFacts, unionBounds, type PartFacts, type Vec3 } from './cad-parts';
import {
  footprint,
  parsePlateChoice,
  plateCenter,
  plateFit,
  plateOf,
  plateVerdict,
  PRINTER_PLATES,
} from './cad-plate';
import {
  clampSection,
  cutSegments,
  defaultSection,
  keepsPoint,
  sectionOutline,
  sectionPlane,
  withAxis,
} from './cad-section';
import { formatAngle, formatBox, formatLength, formatNumber } from './cad-units';
import { parseMeshArtifact } from './mesh-viewport-formats';
import type { ParsedFeaMesh } from './mesh-viewport-mesh';

vi.mock('occt-import-js/dist/occt-import-js.wasm?url', () => ({
  default: resolve(process.cwd(), 'node_modules/occt-import-js/dist/occt-import-js.wasm'),
}));

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(process.cwd(), 'src/test-fixtures/cad', name)));

let mesh: ParsedFeaMesh;
let facts: PartFacts[];

beforeAll(async () => {
  // A 20 × 12 × 6 mm block ("base") with a 3 mm-radius, 10 mm peg ("peg") on top.
  mesh = await parseMeshArtifact(fixture('two-part.step'));
  facts = partFacts(mesh);
}, 30_000);

/** A part's feature edges (as the view draws them), six numbers per segment. */
function featureEdges(part: PartFacts): Float32Array {
  const source = mesh.parts![part.index]!;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(
    new THREE.BufferAttribute(
      mesh.triangles.slice(
        source.triangleStart * 3,
        (source.triangleStart + source.triangleCount) * 3,
      ),
      1,
    ),
  );
  return new THREE.EdgesGeometry(geometry, 35).getAttribute('position').array as Float32Array;
}

/** A top-down orthographic projection, 10 px per millimetre. */
const topDown = (point: Vec3): [number, number] => [point[0] * 10, -point[1] * 10];

describe('part facts', () => {
  it('gives each part its own box, size, triangles and centroid', () => {
    expect(facts.map((part) => part.name)).toEqual(['base', 'peg']);
    const [base, peg] = facts;
    expect(base!.size.map((v) => Number(v.toFixed(3)))).toEqual([20, 12, 6]);
    expect(peg!.size[2]).toBeCloseTo(10, 3);
    expect(peg!.size[0]).toBeCloseTo(6, 1);
    expect(base!.triangles + peg!.triangles).toBe(mesh.triangles.length / 3);
    expect(base!.triangles).toBeGreaterThan(0);
    // The block's surface centroid is its middle; the peg's sits up its axis.
    expect(base!.centroid[2]).toBeCloseTo(3, 1);
    expect(peg!.centroid[2]).toBeGreaterThan(10);
    expect(Math.hypot(peg!.centroid[0], peg!.centroid[1])).toBeLessThan(0.05);
  });

  it('unions the shown parts, moved by their offsets', () => {
    const all = unionBounds(facts, () => true)!;
    expect(all.max[2] - all.min[2]).toBeCloseTo(16, 3);
    const moved = unionBounds(facts, () => true, [
      [0, 0, 0],
      [0, 0, 5],
    ])!;
    expect(moved.max[2]).toBeCloseTo(21, 3);
    expect(unionBounds(facts, (index) => index === 0)!.max[2]).toBeCloseTo(6, 3);
    expect(unionBounds(facts, () => false)).toBeUndefined();
  });
});

describe('measure', () => {
  it('gives the distance and the extent along each axis', () => {
    const result = measureDistance([0, 0, 0], [3, -4, 12]);
    expect(result.distance).toBeCloseTo(13);
    expect(result.delta).toEqual([3, 4, 12]);
  });

  it('snaps to a corner of the block before its edge or face', () => {
    const edges = featureEdges(facts[0]!);
    // The pointer lands 3 px from the corner (10, 6) of the block's top.
    const corner = snapPoint({
      hit: [9.8, 5.8, 6],
      segments: edges,
      project: topDown,
      pointer: [100 - 2, -60 + 2],
      radius: 8,
    });
    expect(corner.kind).toBe('vertex');
    expect(corner.point[0]).toBeCloseTo(10);
    expect(Math.abs(corner.point[1])).toBeCloseTo(6);
  });

  it('snaps to the nearest point on an edge, and keeps the face point away from edges', () => {
    const edges = featureEdges(facts[0]!);
    const edge = snapPoint({
      hit: [2, 5.7, 6],
      segments: edges,
      project: topDown,
      pointer: [20, -57],
      radius: 8,
    });
    expect(edge.kind).toBe('edge');
    expect(edge.point[1]).toBeCloseTo(6);
    expect(edge.point[0]).toBeCloseTo(2, 0);
    const face = snapPoint({
      hit: [5, 0, 6],
      segments: edges,
      project: topDown,
      pointer: [50, 0],
      radius: 8,
    });
    expect(face).toEqual({ kind: 'face', point: [5, 0, 6] });
  });

  it('measures the block from corner to corner', () => {
    const edges = featureEdges(facts[0]!);
    const pick = (x: number, y: number) =>
      snapPoint({ hit: [x, y, 6], segments: edges, project: topDown, pointer: topDown([x, y, 6]), radius: 8 });
    const a = pick(-10, -6);
    const b = pick(10, 6);
    expect(a.kind).toBe('vertex');
    expect(measureDistance(a.point, b.point).distance).toBeCloseTo(Math.hypot(20, 12), 3);
  });

  it('finds the peg rim as a circle of radius 3', () => {
    const edges = featureEdges(facts[1]!);
    // An edge snap on the rim gives the segment the chain starts from.
    const rim = snapPoint({
      hit: [3, 0, 16],
      segments: edges,
      project: topDown,
      pointer: [30, 0],
      radius: 8,
    });
    expect(rim.segment).toBeDefined();
    const circle = fitCircle(edgeChain(edges, rim.segment!));
    expect(circle).toBeDefined();
    expect(circle!.radius).toBeCloseTo(3, 1);
    expect(Math.abs(circle!.normal[2])).toBeCloseTo(1, 3);
  });

  it('does not call a straight edge a circle', () => {
    const edges = featureEdges(facts[0]!);
    const side = snapPoint({ hit: [0, 6, 6], segments: edges, project: topDown, pointer: [0, -60], radius: 8 });
    expect(fitCircle(edgeChain(edges, side.segment!))).toBeUndefined();
  });

  it('reads the angle between faces as 0° parallel and 90° square', () => {
    expect(faceAngle([0, 0, 1], [0, 0, -1])).toBeCloseTo(0);
    expect(faceAngle([0, 0, 1], [1, 0, 0])).toBeCloseTo(90);
    expect(faceAngle([0, 0, 1], [0, 1, 1])).toBeCloseTo(45);
  });
});

describe('exploded view', () => {
  const bounds = () => unionBounds(facts, () => true)!;

  it('moves each part away from the centre along its centroid direction', () => {
    const offsets = explodeOffsets(facts, bounds(), 0.5, [0, 0, 1]);
    const diagonal = Math.hypot(20, 12, 16);
    expect(Math.hypot(...offsets[0]!)).toBeCloseTo(diagonal * 0.5, 3);
    expect(Math.hypot(...offsets[1]!)).toBeCloseTo(diagonal * 0.5, 3);
    // The base (low) moves down, the peg (high) up.
    expect(offsets[0]![2]).toBeLessThan(0);
    expect(offsets[1]![2]).toBeGreaterThan(0);
    expect(isExploded(offsets)).toBe(true);
  });

  it('does nothing at zero or for a single part', () => {
    expect(isExploded(explodeOffsets(facts, bounds(), 0, [0, 0, 1]))).toBe(false);
    expect(explodeOffsets([facts[0]!], bounds(), 1, [0, 0, 1])).toEqual([[0, 0, 0]]);
  });

  it('moves a part centred on the assembly along the up axis', () => {
    const box = { min: [-1, -1, -1] as Vec3, max: [1, 1, 1] as Vec3 };
    const offsets = explodeOffsets(
      [{ centroid: [0, 0, 0] }, { centroid: [1, 0, 0] }],
      box,
      1,
      [0, 1, 0],
    );
    expect(offsets[0]![1]).toBeCloseTo(Math.hypot(2, 2, 2));
    expect(offsets[1]![0]).toBeCloseTo(Math.hypot(2, 2, 2));
  });
});

describe('section plane', () => {
  const box = { min: [0, 0, 0] as Vec3, max: [20, 12, 16] as Vec3 };

  it('starts through the middle and keeps the lower side', () => {
    const state = defaultSection(box, 'y');
    expect(state).toEqual({ axis: 'y', position: 6, flipped: false });
    expect(sectionPlane(state)).toEqual({ normal: [0, -1, 0], constant: 6 });
    expect(keepsPoint(state, [0, 2, 0])).toBe(true);
    expect(keepsPoint(state, [0, 8, 0])).toBe(false);
  });

  it('flips to keep the other side', () => {
    const state = { ...defaultSection(box, 'z'), flipped: true };
    expect(sectionPlane(state)).toEqual({ normal: [0, 0, 1], constant: -8 });
    expect(keepsPoint(state, [0, 0, 10])).toBe(true);
    expect(keepsPoint(state, [0, 0, 2])).toBe(false);
  });

  it('restarts through the middle on a new axis and stays inside the model', () => {
    const state = withAxis({ axis: 'y', position: 1, flipped: true }, 'x', box);
    expect(state).toEqual({ axis: 'x', position: 10, flipped: true });
    expect(clampSection({ axis: 'x', position: 40, flipped: false }, box).position).toBe(20);
    const same = defaultSection(box, 'x');
    expect(clampSection(same, box)).toBe(same);
  });

  it('outlines the cross-section at the plane', () => {
    const corners = sectionOutline(defaultSection(box, 'x'), box);
    expect(corners).toHaveLength(4);
    expect(corners.every((corner) => corner[0] === 10)).toBe(true);
    expect(corners[0]![1]).toBeCloseTo(-0.6);
    expect(corners[2]![2]).toBeCloseTo(16.8);
  });
});

describe('section cut outline', () => {
  it('outlines where the plane cuts the peg: a circle of radius 3 at its height', () => {
    const peg = mesh.parts![1]!;
    const index = mesh.triangles.slice(peg.triangleStart * 3, (peg.triangleStart + peg.triangleCount) * 3);
    const cut = cutSegments(mesh.positions, index, [0, 0, 0], sectionPlane({ axis: 'z', position: 11, flipped: false }));
    expect(cut.length).toBeGreaterThan(6 * 8);
    for (let i = 0; i < cut.length; i += 3) {
      expect(cut[i + 2]).toBeCloseTo(11, 4);
      expect(Math.hypot(cut[i]!, cut[i + 1]!)).toBeGreaterThan(2.9);
    }
    // The cut outline is an edge like any other: its rim reads as a circle.
    const circle = fitCircle(edgeChain(cut, 0), 0.05);
    expect(circle?.radius).toBeCloseTo(3, 1);
  });

  it('moves with an exploded part and is empty where the plane misses', () => {
    const peg = mesh.parts![1]!;
    const index = mesh.triangles.slice(peg.triangleStart * 3, (peg.triangleStart + peg.triangleCount) * 3);
    const plane = sectionPlane({ axis: 'z', position: 30, flipped: false });
    expect(cutSegments(mesh.positions, index, [0, 0, 0], plane)).toHaveLength(0);
    expect(cutSegments(mesh.positions, index, [0, 0, 18], plane).length).toBeGreaterThan(0);
  });
});

describe('print plate', () => {
  it('lists common plates by name and size', () => {
    expect(plateOf({ kind: 'preset', id: 'bambu-a1' })).toEqual({
      name: 'Bambu Lab A1',
      size: [256, 256, 256],
    });
    expect(plateOf({ kind: 'preset', id: 'prusa-mk4' }).size).toEqual([250, 210, 220]);
    expect(plateOf({ kind: 'custom', size: [50, 40, 30] })).toEqual({ size: [50, 40, 30] });
    expect(new Set(PRINTER_PLATES.map((plate) => plate.id)).size).toBe(PRINTER_PLATES.length);
  });

  it('says a model fits', () => {
    const fit = plateFit([63, 20, 24], [256, 256, 256]);
    expect(fit).toEqual({ fits: true, turned: false, over: [0, 0, 0] });
    expect(plateVerdict(fit, 'Bambu Lab A1', 'mm')).toBe('Fits the Bambu Lab A1 plate');
    expect(plateVerdict(fit, undefined, 'mm')).toBe('Fits the custom plate');
  });

  it('says by how much a model is too tall, wide or deep', () => {
    const fit = plateFit([63, 20, 24], [50, 30, 12]);
    expect(fit.fits).toBe(false);
    expect(fit.over).toEqual([13, 0, 12]);
    expect(plateVerdict(fit, undefined, 'mm')).toBe('Too wide by 13.0 mm; Too tall by 12.0 mm');
    expect(plateVerdict(plateFit([10, 10, 262], [256, 256, 256]), 'A', 'in')).toBe(
      'Too tall by 0.24 in',
    );
  });

  it('says when a model fits only turned 90° on the plate', () => {
    const fit = plateFit([240, 100, 50], [210, 250, 220]);
    expect(fit.fits).toBe(false);
    expect(fit.turned).toBe(true);
    expect(plateVerdict(fit, 'Prusa MK4', 'mm')).toBe('Fits the Prusa MK4 plate when turned 90°');
  });

  it('reads the footprint and places the plate under a Y-up model', () => {
    expect(footprint([10, 30, 20], 'y')).toEqual([10, 20, 30]);
    expect(footprint([10, 30, 20], 'z')).toEqual([10, 30, 20]);
    const bounds = { min: [-5, 2, 0] as Vec3, max: [5, 32, 20] as Vec3 };
    expect(plateCenter(bounds, 'y')).toEqual([0, 2, 10]);
    expect(plateCenter(bounds, 'z')).toEqual([0, 17, 0]);
  });

  it('reads back only a choice it understands', () => {
    expect(parsePlateChoice('{"kind":"preset","id":"ender-3"}')).toEqual({
      kind: 'preset',
      id: 'ender-3',
    });
    expect(parsePlateChoice('{"kind":"custom","size":[120,120,100]}')).toEqual({
      kind: 'custom',
      size: [120, 120, 100],
    });
    expect(parsePlateChoice('{"kind":"preset","id":"unknown"}')).toBeUndefined();
    expect(parsePlateChoice('{"kind":"custom","size":[0,1,2]}')).toBeUndefined();
    expect(parsePlateChoice('not json')).toBeUndefined();
    expect(parsePlateChoice(null)).toBeUndefined();
  });
});

describe('units', () => {
  it('formats lengths in millimetres and inches', () => {
    expect(formatLength(12.345, 'mm')).toBe('12.35 mm');
    expect(formatLength(25.4, 'in')).toBe('1.000 in');
    expect(formatLength(12, 'mm', 'size')).toBe('12.0 mm');
    expect(formatNumber(-0.001, 'mm')).toBe('0.00');
    expect(formatBox([63, 20, 24], 'mm')).toBe('63.0 × 20.0 × 24.0 mm');
    expect(formatBox([63, 20, 24], 'in')).toBe('2.48 × 0.79 × 0.94 in');
    expect(formatAngle(45)).toBe('45.0°');
  });
});

describe('snapping behind the surface', () => {
  it('does not snap to an edge hidden behind the picked face', () => {
    // Two edges project onto the same screen line; the far one is 12 mm behind the face.
    const segments = Float32Array.from([0, 0, 0, 10, 0, 0, 0, 12, 0, 10, 12, 0]);
    const project = (p: Vec3): [number, number] => [p[0] * 10, 0];
    const depth = (p: Vec3) => p[1];
    const near = snapPoint({
      hit: [5, 0.5, 0],
      segments,
      project,
      pointer: [50, 0],
      radius: 8,
      occlusion: { depth, tolerance: 1 },
    });
    expect(near.point[1]).toBe(0);
    const behind = snapPoint({
      hit: [5, 0, 0],
      segments: segments.subarray(6),
      project,
      pointer: [50, 0],
      radius: 8,
      occlusion: { depth, tolerance: 1 },
    });
    expect(behind.kind).toBe('face');
  });
});
