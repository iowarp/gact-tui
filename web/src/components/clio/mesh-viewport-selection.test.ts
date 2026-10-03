import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { projectedMeshNodeIds } from './mesh-viewport-scene';

describe('mesh viewport box selection', () => {
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  const data = {
    positions: Float32Array.from([-1, 0, -5, 0, 0, -5, 1, 0, 5]),
    nodeIndex: Float32Array.from([3, 1, 7]),
  };
  const visibleTriangles = Uint32Array.from([0, 1, 2, 1, 0, 2]);

  it('returns stable unique node ids inside the projected rectangle', () => {
    expect(projectedMeshNodeIds(data, visibleTriangles, camera, { width: 100, height: 100 }, {
      left: 45, top: 45, right: 55, bottom: 55,
    })).toEqual([1]);
  });

  it('excludes nodes behind the camera and avoids duplicate triangle corners', () => {
    expect(projectedMeshNodeIds(data, visibleTriangles, camera, { width: 100, height: 100 }, {
      left: 0, top: 0, right: 100, bottom: 100,
    })).toEqual([1, 3]);
  });

  it('returns no nodes for a viewport with no rendered size', () => {
    expect(projectedMeshNodeIds(data, visibleTriangles, camera, { width: 0, height: 100 }, {
      left: 0, top: 0, right: 100, bottom: 100,
    })).toEqual([]);
  });
});
