import * as THREE from 'three';
import type { ParsedFeaMesh } from './mesh-viewport-mesh';

/**
 * Conversions the 3D file viewer declares for Export to…: the tessellated model as a binary
 * STL (what slicers read) or a GLB (what other viewers read, with part names and colours).
 * Both are written from the triangles the viewer shows, every part included.
 */

/** A binary STL of every triangle: 80-byte header, count, then normal, corners, attribute. */
export function binaryStl(mesh: Pick<ParsedFeaMesh, 'positions' | 'triangles'>, name: string) {
  const count = mesh.triangles.length / 3;
  const bytes = new Uint8Array(84 + count * 50);
  const view = new DataView(bytes.buffer);
  // The header is free text; it must not begin with "solid", which marks ASCII STL.
  bytes.set(new TextEncoder().encode(`binary STL ${name}`.slice(0, 80)));
  view.setUint32(80, count, true);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const corner = (target: THREE.Vector3, vertex: number) =>
    target.fromArray(mesh.positions, vertex * 3);
  for (let t = 0; t < count; t += 1) {
    corner(a, mesh.triangles[t * 3]!);
    corner(b, mesh.triangles[t * 3 + 1]!);
    corner(c, mesh.triangles[t * 3 + 2]!);
    normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
    let offset = 84 + t * 50;
    for (const vector of [normal, a, b, c]) {
      view.setFloat32(offset, vector.x, true);
      view.setFloat32(offset + 4, vector.y, true);
      view.setFloat32(offset + 8, vector.z, true);
      offset += 12;
    }
  }
  return bytes;
}

/** The model as one scene of named, coloured meshes, one per part. */
export function partScene(mesh: ParsedFeaMesh, colors: Float32Array): THREE.Scene {
  const scene = new THREE.Scene();
  const parts = mesh.parts?.length
    ? mesh.parts
    : [
        {
          name: '',
          triangleStart: 0,
          triangleCount: mesh.triangles.length / 3,
          vertexStart: 0,
          vertexCount: mesh.positions.length / 3,
        },
      ];
  parts.forEach((part, index) => {
    const geometry = new THREE.BufferGeometry();
    const from = part.vertexStart;
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(mesh.positions.slice(from * 3, (from + part.vertexCount) * 3), 3),
    );
    const triangles = mesh.triangles
      .slice(part.triangleStart * 3, (part.triangleStart + part.triangleCount) * 3)
      .map((vertex) => vertex - from);
    geometry.setIndex(new THREE.BufferAttribute(triangles, 1));
    geometry.computeVertexNormals();
    const color = new THREE.Color(colors[from * 3], colors[from * 3 + 1], colors[from * 3 + 2]);
    const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
    object.name = part.name || `part-${index + 1}`;
    scene.add(object);
  });
  return scene;
}

/** A self-contained GLB of the parts, written by three's glTF exporter. */
export async function glbOf(mesh: ParsedFeaMesh, colors: Float32Array): Promise<Uint8Array> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const scene = partScene(mesh, colors);
  try {
    const result = await new GLTFExporter().parseAsync(scene, { binary: true });
    return new Uint8Array(result as ArrayBuffer);
  } finally {
    scene.traverse((object) => {
      const item = object as THREE.Mesh;
      if (!item.isMesh) return;
      item.geometry.dispose();
      (item.material as THREE.Material).dispose();
    });
  }
}
