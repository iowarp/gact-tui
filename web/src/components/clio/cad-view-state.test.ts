import { describe, expect, it } from 'vitest';
import type { PartFacts } from './cad-parts';
import { cadViewState, cameraWords, type CadViewStateInput } from './cad-view-state';

const facts: PartFacts[] = [
  {
    index: 0,
    name: 'body',
    bounds: { min: [0, 0, 0], max: [70, 24, 20] },
    size: [70, 24, 20],
    triangles: 224,
    centroid: [35, 12, 10],
  },
  {
    index: 1,
    name: 'plug',
    bounds: { min: [62, 0, 0], max: [82, 24, 20] },
    size: [20, 24, 20],
    triangles: 456,
    centroid: [72, 12, 10],
  },
];

function input(change: Partial<CadViewStateInput> = {}): CadViewStateInput {
  return {
    name: 'whistle_assembly.step',
    up: 'z',
    unit: 'mm',
    projection: 'perspective',
    viewDirection: [0.577, -0.577, 0.577],
    facts,
    hidden: new Set(),
    size: [82, 24, 20],
    explode: 0,
    focus: 'normal',
    measurements: [],
    ...change,
  };
}

describe('the 3D view state the agent reads', () => {
  it('states the model, camera, section, explode, parts and selection in words', () => {
    expect(cadViewState(input())).toEqual([
      'Model: whistle_assembly.step, 2 parts (body, plug); Z is up; lengths in millimetres',
      'Size of the shown parts, as modelled: 82.0 × 24.0 × 20.0 mm',
      'Camera: looking from between +X, −Y, +Z (direction to camera 0.58, -0.58, 0.58), perspective projection',
      'Section: none',
      'Exploded view: off (parts assembled)',
      'Visible parts: all (body, plug)',
      'Selected part: none',
      'Measurements: none',
    ]);
  });

  it('carries the section, the selection, hidden parts and every measurement', () => {
    const lines = cadViewState(
      input({
        unit: 'mm',
        projection: 'orthographic',
        viewDirection: [0, -1, 0],
        section: { axis: 'y', position: 12, flipped: false },
        explode: 0.35,
        selected: 1,
        focus: 'ghost',
        hidden: new Set([0]),
        measurements: [
          {
            id: 'm1',
            mode: 'distance',
            points: [
              [10, 12, 0],
              [10, 12, 3],
            ],
            parts: [0, 0],
            snaps: ['edge', 'edge'],
            distance: { distance: 3, delta: [0, 0, 3] },
          },
          {
            id: 'm2',
            mode: 'radius',
            points: [[72, 12, 18]],
            parts: [1],
            snaps: ['edge'],
            circle: { center: [72, 12, 18], radius: 2, normal: [0, 0, 1] },
          },
        ],
        measuring: true,
      }),
    );
    expect(lines).toContain(
      'Camera: looking from the front (camera on the −Y side), orthographic projection',
    );
    expect(lines).toContain(
      'Section: plane across Y at Y = 12.0 mm, keeping the side below (−Y); cut faces are filled solid',
    );
    expect(lines).toContain(
      'Exploded view: 35 % (parts moved apart; measurements and sizes are as modelled)',
    );
    expect(lines).toContain('Visible parts: plug; hidden: body');
    expect(lines).toContain(
      'Selected part: plug, 20.0 × 24.0 × 20.0 mm, 456 triangles; the other parts are ghosted',
    );
    expect(lines).toContain(
      'Measurement 1: distance 3.00 mm (ΔX 0.00, ΔY 0.00, ΔZ 3.00), edge to edge, on body',
    );
    expect(lines).toContain('Measurement 2: round edge, diameter 4.00 mm (radius 2.00 mm), on plug');
    expect(lines).toContain('Measuring: a first point is placed, the second is not');
  });

  it('reads sizes in inches when the view does, and names Y-up views', () => {
    const lines = cadViewState(input({ unit: 'in', up: 'y', viewDirection: [0, 1, 0] }));
    expect(lines[1]).toBe('Size of the shown parts, as modelled: 3.23 × 0.94 × 0.79 in');
    expect(lines[2]).toBe(
      'Camera: looking from the top (camera on the +Y side), perspective projection',
    );
    expect(cameraWords([0, 0, -5], 'z')).toBe('looking from the bottom (camera on the −Z side)');
  });
});
