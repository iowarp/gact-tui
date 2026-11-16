import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { meshPartLabel, projectedMeshNodeIds, projectedMeshParts } from './mesh-viewport-scene';

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

  it('names the parts under the rectangle, the most covered first (a mark over a case names cutout_J1)', () => {
    // Three parts in front of the camera: lid (2 vertices), cutout_J1 (2), J1 (1, held by "board").
    const scene = {
      positions: Float32Array.from([
        -0.2, 0, -5, 0.2, 0, -5, // lid, centre
        -0.1, 0.1, -5, 0.1, 0.1, -5, // cutout_J1, centre
        0, -0.1, -5, // J1, centre
        3, 3, -5, // lid, far corner (outside the box)
      ]),
      parts: [
        { name: 'cutout_J1', triangleStart: 0, triangleCount: 0, vertexStart: 2, vertexCount: 2 },
        { name: 'lid', triangleStart: 0, triangleCount: 0, vertexStart: 0, vertexCount: 2 },
        { name: 'J1', ancestors: ['board'], triangleStart: 0, triangleCount: 0, vertexStart: 4, vertexCount: 1 },
        { name: '', triangleStart: 0, triangleCount: 0, vertexStart: 5, vertexCount: 1 },
      ].sort((a, b) => a.vertexStart - b.vertexStart),
    };
    const visible = Uint32Array.from([0, 1, 2, 3, 4, 5]);
    expect(projectedMeshParts(scene, visible, camera, { width: 100, height: 100 }, {
      left: 40, top: 40, right: 60, bottom: 60,
    })).toEqual(['cutout_J1', 'lid', 'J1 in board']);
    expect(projectedMeshParts({ positions: scene.positions }, visible, camera, { width: 100, height: 100 }, {
      left: 0, top: 0, right: 100, bottom: 100,
    })).toEqual([]);
  });

  it('reads a CAD sub-mesh named after its node as that node (lid_65 under lid is the lid)', () => {
    expect(meshPartLabel({ name: 'lid_65', ancestors: ['lid', 'enclosure'] })).toBe('lid in enclosure');
    expect(meshPartLabel({ name: 'cutout_J1_3', ancestors: ['cutout_J1', 'enclosure'] })).toBe('cutout_J1 in enclosure');
    expect(meshPartLabel({ name: 'cutout_J1_lid', ancestors: ['cutout_J1', 'enclosure'] })).toBe('cutout_J1_lid in cutout_J1 in enclosure');
    expect(meshPartLabel({ name: 'J1', ancestors: ['board'] })).toBe('J1 in board');
  });
});
