import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParsedMeshCache, parsedMeshBytes } from './mesh-viewport-cache';
import { fitBoxDistance } from './mesh-viewport-framing';
import type { ParsedFeaMesh } from './mesh-viewport-mesh';

/** A parsed mesh whose typed arrays total exactly `bytes` (a multiple of 4). */
function meshOf(bytes: number): ParsedFeaMesh {
  return {
    positions: new Float32Array(bytes / 4),
    triangles: new Uint32Array(0),
    nodeIndex: new Float32Array(0),
    topology: 'surface',
    fields: [],
    frames: [],
    cells: 0,
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('parsed mesh cache', () => {
  it('counts every typed array a parsed mesh holds', () => {
    const mesh = meshOf(400);
    mesh.fields.push({
      name: 'S',
      label: 'S',
      unit: '',
      location: 'node',
      count: 25,
      frames: 1,
      min: 0,
      max: 1,
      data: new Float32Array(25),
    });
    expect(parsedMeshBytes(mesh)).toBe(500);
  });

  it('evicts the least recently used meshes once the budget is exceeded, and says so', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const cache = new ParsedMeshCache(1_000);
    cache.set('a', meshOf(400));
    cache.set('b', meshOf(400));
    expect(cache.get('a')).toBeDefined(); // a is now the most recently used
    cache.set('c', meshOf(400));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.bytes).toBe(800);
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining('evict key=b reason=budget_exceeded'),
    );
  });

  it('never keeps a mesh larger than the whole budget', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const cache = new ParsedMeshCache(1_000);
    cache.set('small', meshOf(400));
    cache.set('huge', meshOf(2_000));
    expect(cache.get('huge')).toBeUndefined();
    expect(cache.get('small')).toBeDefined();
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('reason=larger_than_budget'));
  });

  it('replacing a key does not count it twice', () => {
    const cache = new ParsedMeshCache(1_000);
    cache.set('a', meshOf(400));
    cache.set('a', meshOf(600));
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(600);
  });
});

describe('mesh framing', () => {
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3(1, 0.5, 1).normalize();

  function projected(bounds: { min: number[]; max: number[] }, fov: number, aspect: number) {
    const fit = fitBoxDistance(bounds as never, direction, up, fov, aspect);
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, 1e6);
    camera.up.copy(up);
    camera.position.copy(fit.center).addScaledVector(direction, fit.distance);
    camera.lookAt(fit.center);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let extent = 0;
    for (const x of [bounds.min[0]!, bounds.max[0]!])
      for (const y of [bounds.min[1]!, bounds.max[1]!])
        for (const z of [bounds.min[2]!, bounds.max[2]!]) {
          const p = new THREE.Vector3(x, y, z).project(camera);
          extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
        }
    return { fit, extent };
  }

  it('fits a slender part closer than its bounding sphere and keeps every corner in view', () => {
    const beam = { min: [0, 0, 0], max: [72, 24, 8] };
    const { fit, extent } = projected(beam, 35, 16 / 9);
    const sphere = fit.radius / Math.sin(THREE.MathUtils.degToRad(35 / 2));
    expect(fit.distance).toBeLessThan(sphere);
    expect(extent).toBeLessThanOrEqual(1);
    expect(extent).toBeGreaterThan(0.85); // the part fills the view, with a small margin
  });

  it('keeps a wide part inside a narrow (portrait) view', () => {
    const { extent } = projected({ min: [0, 0, 0], max: [100, 10, 10] }, 35, 0.5);
    expect(extent).toBeLessThanOrEqual(1);
  });
});
