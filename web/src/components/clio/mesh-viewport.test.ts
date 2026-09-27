import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { meshViewportSchema } from './a2ui-mesh-viewport-catalog';
import { formatFieldValue, legendTicks, turbo } from './mesh-viewport-colormap';
import {
  parseFeaMesh,
  selectTriangles,
  vertexValue,
  type ParsedFeaMesh,
} from './mesh-viewport-mesh';
import {
  joinMeshSyncGroup,
  meshGroupBounds,
  meshGroupRange,
  publishMeshCamera,
  type MeshSyncMember,
} from './mesh-viewport-sync';

// Written by the marketplace exporter (fea_glb.py): two C3D8R bricks sharing
// the face x=10. bricks.glb is a cells export with DENSITY over three cycles
// (brick 2 goes 1 -> 0.4 -> 0.1) and one S_MISES frame; surface.glb is the
// outer surface with S_MISES only.
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(process.cwd(), 'src/test-fixtures/mesh', name)));
}

function member(id: string, overrides: Partial<MeshSyncMember> = {}): MeshSyncMember {
  return { id, applyCamera: vi.fn(), groupChanged: vi.fn(), ...overrides };
}

function field(mesh: ParsedFeaMesh, name: string) {
  const found = mesh.fields.find((f) => f.name === name);
  if (!found) throw new Error(`fixture has no ${name}`);
  return found;
}

describe('clio.mesh-viewport.v1 adapter schema', () => {
  it('accepts bound field, threshold, frame, and camera', () => {
    expect(
      meshViewportSchema.safeParse({
        meshUri: 'artifact://artifact_abc123',
        field: 'DENSITY',
        showField: { path: '/showStress' },
        frame: { path: '/cycle' },
        thresholdField: 'DENSITY',
        thresholdMin: { path: '/iso' },
        thresholdMax: 1,
        camera: { path: '/camera' },
        syncGroup: 'compare',
        upAxis: 'y',
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ meshUri: '/scratch/part.glb' }],
    [{ meshUri: 'artifact://artifact_abc123', vertices: [] }],
    [{ meshUri: 'artifact://artifact_abc123', syncGroup: 'two words' }],
    [{ meshUri: 'artifact://artifact_abc123', thresholdMin: 'low' }],
  ])('rejects %j', (payload) => {
    expect(meshViewportSchema.safeParse(payload).success).toBe(false);
  });
});

describe('parseFeaMesh', () => {
  it('reads the cells contract: index maps, frames, and frame-major fields', async () => {
    const mesh = await parseFeaMesh(fixture('bricks.glb'));
    expect(mesh.topology).toBe('cells');
    expect(mesh.cells).toBe(2);
    expect(mesh.frames).toEqual(['Cycle 0', 'Cycle 1', 'Cycle 2']);
    expect(mesh.triangles.length / 3).toBe(22);
    const density = field(mesh, 'DENSITY');
    expect([density.location, density.frames, density.count]).toEqual(['cell', 3, 2]);
    expect(Array.from(density.data)).toEqual([
      1,
      1,
      1,
      expect.closeTo(0.4),
      1,
      expect.closeTo(0.1),
    ]);
    expect(field(mesh, 'S_MISES')).toMatchObject({ location: 'node', frames: 1, min: 0, max: 110 });
    expect(mesh.bounds).toEqual({ min: [0, 0, 0], max: [20, 10, 10] });
  });

  it('reads a surface export', async () => {
    const mesh = await parseFeaMesh(fixture('surface.glb'));
    expect(mesh.topology).toBe('surface');
    expect(mesh.cellA).toBeUndefined();
    expect(mesh.triangles.length / 3).toBe(20);
  });

  it('rejects bytes that are not exporter output', async () => {
    await expect(parseFeaMesh(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});

describe('selectTriangles (threshold)', () => {
  it('shows the model boundary when nothing is thresholded', async () => {
    const mesh = await parseFeaMesh(fixture('bricks.glb'));
    const selection = selectTriangles(mesh, { frame: 0 });
    expect(selection.index.length / 3).toBe(20);
    expect(selection.visibleCells).toBe(2);
  });

  it('rebuilds the surface around the cells that pass, per frame', async () => {
    const mesh = await parseFeaMesh(fixture('bricks.glb'));
    const threshold = { field: field(mesh, 'DENSITY'), min: 0.3, max: 1 };
    // Cycle 1: brick 2 is at 0.4, still kept.
    expect(selectTriangles(mesh, { threshold, frame: 1 }).visibleCells).toBe(2);
    // Cycle 2: brick 2 drops to 0.1, so only brick 1's six faces remain,
    // including the formerly shared face, now showing brick 1.
    const cut = selectTriangles(mesh, { threshold, frame: 2 });
    expect(cut.visibleCells).toBe(1);
    expect(cut.index.length / 3).toBe(12);
    expect(new Set(cut.triangleCell)).toEqual(new Set([0]));
  });

  it('colors cell faces by the kept cell and node values by node', async () => {
    const mesh = await parseFeaMesh(fixture('bricks.glb'));
    const density = field(mesh, 'DENSITY');
    const cut = selectTriangles(mesh, {
      threshold: { field: density, min: 0.3, max: 1 },
      frame: 2,
    });
    const vertex = cut.index[0]!;
    expect(vertexValue(mesh, density, 2, vertex, cut.triangleCell[0]!)).toBe(1);
    const node = mesh.nodeIndex[vertex]!;
    expect(vertexValue(mesh, field(mesh, 'S_MISES'), 2, vertex, -1)).toBe(node * 10);
  });

  it('keeps whole triangles inside a node-field range on a surface', async () => {
    const mesh = await parseFeaMesh(fixture('surface.glb'));
    const mises = field(mesh, 'S_MISES');
    const all = selectTriangles(mesh, { threshold: { field: mises, min: 0, max: 110 }, frame: 0 });
    const none = selectTriangles(mesh, {
      threshold: { field: mises, min: 500, max: 600 },
      frame: 0,
    });
    expect(all.index.length / 3).toBe(20);
    expect(none.index.length).toBe(0);
  });
});

describe('mesh viewport sync groups', () => {
  it('shares bounds and a per-field color range across members', () => {
    const before = member('before', {
      bounds: { min: [0, 0, 0], max: [10, 10, 10] },
      range: { field: 'S_MISES', min: 5, max: 120 },
    });
    const after = member('after', {
      bounds: { min: [-2, 0, 0], max: [8, 12, 10] },
      range: { field: 'S_MISES', min: 1, max: 310 },
    });
    const leaveBefore = joinMeshSyncGroup('g1', before);
    const leaveAfter = joinMeshSyncGroup('g1', after);
    expect(meshGroupBounds('g1')).toEqual({ min: [-2, 0, 0], max: [10, 12, 10] });
    expect(meshGroupRange('g1', 'S_MISES')).toEqual({ min: 1, max: 310, members: 2 });
    expect(meshGroupRange('g1', 'U_MAG')).toBeUndefined();
    leaveAfter();
    expect(meshGroupRange('g1', 'S_MISES')).toEqual({ min: 5, max: 120, members: 1 });
    leaveBefore();
    expect(meshGroupBounds('g1')).toBeUndefined();
  });

  it('forwards camera moves to every other member, never back to the sender', () => {
    const a = member('a');
    const b = member('b');
    const leaveA = joinMeshSyncGroup('g2', a);
    const leaveB = joinMeshSyncGroup('g2', b);
    publishMeshCamera('g2', a, { position: [1, 2, 3], target: [0, 0, 0], zoom: 1 });
    expect(b.applyCamera).toHaveBeenCalledTimes(1);
    expect(a.applyCamera).not.toHaveBeenCalled();
    leaveA();
    leaveB();
  });
});

describe('mesh viewport color scale', () => {
  it('runs from blue near the low end to red near the high end', () => {
    const [lowR, , lowB] = turbo(0.15);
    const [highR, , highB] = turbo(0.95);
    expect(lowB).toBeGreaterThan(lowR);
    expect(highR).toBeGreaterThan(highB);
  });

  it('labels ticks with readable numbers', () => {
    expect(legendTicks(0, 400).map(formatFieldValue)).toEqual([
      '0.000',
      '100',
      '200',
      '300',
      '400',
    ]);
    expect(formatFieldValue(0.00042)).toBe('4.20e-4');
    expect(legendTicks(3, 3)).toEqual([3]);
  });
});
