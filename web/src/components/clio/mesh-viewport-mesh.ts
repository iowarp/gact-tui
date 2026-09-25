import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MeshBounds } from './mesh-viewport-sync';

/**
 * The `clio.fea-mesh.v1` contract written by the marketplace exporter
 * (`fea_glb.py`): one triangle mesh whose `_NODE` attribute maps vertices to
 * node rows, optional `_CELL_A`/`_CELL_B` attributes naming the elements on
 * both sides of every face, and standalone field accessors (frame-major)
 * described in `scenes[0].extras.clio`.
 */
export interface MeshField {
  name: string;
  label: string;
  unit: string;
  location: 'node' | 'cell';
  count: number;
  frames: number;
  min: number;
  max: number;
  data: Float32Array;
}

export interface ParsedFeaMesh {
  positions: Float32Array;
  triangles: Uint32Array;
  nodeIndex: Float32Array;
  cellA?: Float32Array;
  cellB?: Float32Array;
  topology: 'surface' | 'cells';
  fields: MeshField[];
  frames: string[];
  stage?: string;
  lengthUnit?: string;
  cells: number;
  bounds: MeshBounds;
}

interface ClioExtras {
  contract?: string;
  stage?: string;
  topology?: string;
  units?: { length?: string };
  fields?: Array<Partial<Omit<MeshField, 'data'>> & { accessor?: number }>;
  frames?: Array<{ label?: string }>;
  counts?: { nodes?: number; cells?: number };
}

function attributeArray(geometry: THREE.BufferGeometry, name: string): Float32Array | undefined {
  const attribute = geometry.getAttribute(name);
  return attribute ? Float32Array.from(attribute.array as ArrayLike<number>) : undefined;
}

/** Parse exporter output; fields whose data does not match their declaration are dropped. */
export async function parseFeaMesh(bytes: Uint8Array): Promise<ParsedFeaMesh> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer as ArrayBuffer, '');
  let mesh: THREE.Mesh | undefined;
  gltf.scene.traverse((object) => {
    if (!mesh && (object as THREE.Mesh).isMesh) mesh = object as THREE.Mesh;
  });
  if (!mesh) throw new Error('The file contains no triangle mesh.');
  mesh.updateWorldMatrix(true, false);
  const geometry = (mesh.geometry as THREE.BufferGeometry).clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const extras = ((gltf.scene.userData as { clio?: ClioExtras }).clio ?? {}) as ClioExtras;
  if (extras.contract !== 'clio.fea-mesh.v1') {
    throw new Error('The file is not a clio.fea-mesh.v1 mesh from the exporter.');
  }
  const positions = attributeArray(geometry, 'position')!;
  const vertexCount = positions.length / 3;
  const index = geometry.getIndex();
  const triangles = index
    ? Uint32Array.from(index.array as ArrayLike<number>)
    : Uint32Array.from({ length: vertexCount }, (_, i) => i);
  const nodeIndex =
    attributeArray(geometry, '_node') ?? Float32Array.from({ length: vertexCount }, (_, i) => i);
  const cellA = attributeArray(geometry, '_cell_a');
  const cellB = attributeArray(geometry, '_cell_b');
  const topology = extras.topology === 'cells' && cellA && cellB ? 'cells' : 'surface';
  const frames = (extras.frames ?? []).map((frame, i) => frame.label || `Frame ${i}`);

  const fields: MeshField[] = [];
  for (const declared of extras.fields ?? []) {
    if (typeof declared.accessor !== 'number' || !declared.name) continue;
    const location = declared.location === 'cell' ? 'cell' : 'node';
    if (location === 'cell' && topology !== 'cells') continue;
    const attribute = (await gltf.parser.getDependency('accessor', declared.accessor)) as
      | THREE.BufferAttribute
      | undefined;
    const count = declared.count ?? 0;
    const frameCount = declared.frames ?? 1;
    if (!attribute || attribute.count !== count * frameCount || count === 0) continue;
    const data = Float32Array.from(attribute.array as ArrayLike<number>);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const value of data) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    fields.push({
      name: declared.name,
      label: declared.label || declared.name,
      unit: declared.unit ?? '',
      location,
      count,
      frames: frameCount,
      min,
      max,
      data,
    });
  }
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  geometry.dispose();
  return {
    positions,
    triangles,
    nodeIndex,
    cellA: topology === 'cells' ? cellA : undefined,
    cellB: topology === 'cells' ? cellB : undefined,
    topology,
    fields,
    frames,
    stage: extras.stage,
    lengthUnit: extras.units?.length,
    cells: extras.counts?.cells ?? 0,
    bounds: { min: box.min.toArray(), max: box.max.toArray() },
  };
}

export interface MeshViewState {
  /** Field to color by, or undefined for plain geometry. */
  color?: { field: MeshField; min: number; max: number };
  /** Keep only cells (or triangles, on a surface) whose value lies in [min, max]. */
  threshold?: { field: MeshField; min: number; max: number };
  frame: number;
}

export interface MeshSelection {
  /** Triangle indices into `positions`, three per visible triangle. */
  index: Uint32Array;
  /** The cell each visible triangle shows (-1 on surface meshes), for coloring and probing. */
  triangleCell: Int32Array;
  visibleCells: number;
}

function frameOffset(field: MeshField, frame: number): number {
  const clamped = Math.min(Math.max(0, Math.round(frame)), field.frames - 1);
  return clamped * field.count;
}

/**
 * Which triangles are visible. A cell face shows when exactly one side is a
 * kept cell, which is the outer surface of the kept region; with no
 * threshold every cell is kept, leaving the model's own boundary.
 */
export function selectTriangles(mesh: ParsedFeaMesh, view: MeshViewState): MeshSelection {
  const tri = mesh.triangles;
  const count = tri.length / 3;
  const index = new Uint32Array(tri.length);
  const triangleCell = new Int32Array(count);
  const threshold = view.threshold;
  const tOffset = threshold ? frameOffset(threshold.field, view.frame) : 0;
  let kept = 0;
  if (mesh.topology === 'cells' && mesh.cellA && mesh.cellB) {
    const cellA = mesh.cellA;
    const cellB = mesh.cellB;
    const cellKept = (cell: number) => {
      if (cell < 0) return false;
      if (!threshold || threshold.field.location !== 'cell') return true;
      const value = threshold.field.data[tOffset + cell] ?? Number.NaN;
      return value >= threshold.min && value <= threshold.max;
    };
    let keptCells = 0;
    if (threshold && threshold.field.location === 'cell') {
      for (let cell = 0; cell < threshold.field.count; cell += 1)
        if (cellKept(cell)) keptCells += 1;
    } else {
      keptCells = mesh.cells;
    }
    for (let t = 0; t < count; t += 1) {
      const v = tri[t * 3]!;
      const a = cellA[v]!;
      const b = cellB[v]!;
      const inA = cellKept(a);
      const inB = cellKept(b);
      if (inA === inB) continue;
      index[kept * 3] = v;
      index[kept * 3 + 1] = tri[t * 3 + 1]!;
      index[kept * 3 + 2] = tri[t * 3 + 2]!;
      triangleCell[kept] = inA ? a : b;
      kept += 1;
    }
    return {
      index: index.slice(0, kept * 3),
      triangleCell: triangleCell.slice(0, kept),
      visibleCells: keptCells,
    };
  }
  const nodeField = threshold?.field.location === 'node' ? threshold : undefined;
  for (let t = 0; t < count; t += 1) {
    if (nodeField) {
      let inside = true;
      for (let k = 0; k < 3; k += 1) {
        const node = mesh.nodeIndex[tri[t * 3 + k]!]!;
        const value = nodeField.field.data[tOffset + node] ?? Number.NaN;
        if (!(value >= nodeField.min && value <= nodeField.max)) inside = false;
      }
      if (!inside) continue;
    }
    index.set(tri.subarray(t * 3, t * 3 + 3), kept * 3);
    triangleCell[kept] = -1;
    kept += 1;
  }
  return {
    index: index.slice(0, kept * 3),
    triangleCell: triangleCell.slice(0, kept),
    visibleCells: 0,
  };
}

/** Field value shown by one vertex of a visible triangle. */
export function vertexValue(
  mesh: ParsedFeaMesh,
  field: MeshField,
  frame: number,
  vertex: number,
  cell: number,
): number {
  const offset = frameOffset(field, frame);
  if (field.location === 'cell')
    return cell >= 0 ? (field.data[offset + cell] ?? Number.NaN) : Number.NaN;
  return field.data[offset + mesh.nodeIndex[vertex]!] ?? Number.NaN;
}
