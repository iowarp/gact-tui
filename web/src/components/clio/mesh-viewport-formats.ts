import * as THREE from 'three';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { VTKLoader } from 'three/examples/jsm/loaders/VTKLoader.js';
import { parseFeaMesh, type ParsedFeaMesh } from './mesh-viewport-mesh';

export type MeshFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'ply' | 'fbx' | '3mf' | 'vtk' | 'vtp' | 'drc';

export class MeshFormatError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MeshFormatError';
  }
}

const decoder = new TextDecoder();

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function detectedFormat(bytes: Uint8Array): MeshFormat | undefined {
  const head = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 512))).trimStart();
  if (head.startsWith('glTF')) return 'glb';
  if (head.startsWith('{') && /"asset"\s*:/u.test(head)) return 'gltf';
  if (head.startsWith('ply\n') || head.startsWith('ply\r')) return 'ply';
  if (head.startsWith('# vtk DataFile')) return 'vtk';
  if (head.startsWith('<?xml') && head.includes('VTKFile')) return 'vtp';
  if (head.startsWith('<VTKFile')) return 'vtp';
  if (head.startsWith('Kaydara FBX Binary') || head.startsWith('; FBX')) return 'fbx';
  if (head.startsWith('DRACO')) return 'drc';
  if (/^(?:#.*\n|mtllib .*\n|o .*\n|g .*\n|v [-\d])/u.test(head) && /^v\s+[-\d]/mu.test(head)) return 'obj';
  if (head.startsWith('solid ') && head.includes('facet')) return 'stl';
  return undefined;
}

function checkContainedGltf(bytes: Uint8Array, format: 'glb' | 'gltf'): void {
  let document: unknown;
  try {
    if (format === 'glb') {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (bytes.byteLength < 20 || decoder.decode(bytes.subarray(0, 4)) !== 'glTF') {
        throw new MeshFormatError('mesh_glb_header', 'The GLB file has no valid glTF header.');
      }
      const jsonLength = view.getUint32(12, true);
      if (jsonLength > bytes.byteLength - 20 || decoder.decode(bytes.subarray(16, 20)) !== 'JSON') {
        throw new MeshFormatError('mesh_glb_json', 'The GLB file has no valid JSON chunk.');
      }
      document = JSON.parse(decoder.decode(bytes.subarray(20, 20 + jsonLength)));
    } else {
      document = JSON.parse(decoder.decode(bytes));
    }
  } catch (error) {
    if (error instanceof MeshFormatError) throw error;
    throw new MeshFormatError('mesh_gltf_json', 'The glTF JSON could not be read.');
  }
  const source = document as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  for (const item of [...(source.buffers ?? []), ...(source.images ?? [])]) {
    if (item.uri && !item.uri.startsWith('data:')) {
      throw new MeshFormatError('mesh_external_resource', 'This glTF references an external buffer or image. Register a self-contained GLB or embed resources as data URIs.');
    }
  }
}

function parseVtp(bytes: Uint8Array): THREE.BufferGeometry {
  const xml = new DOMParser().parseFromString(decoder.decode(bytes), 'application/xml');
  if (xml.querySelector('parsererror')) throw new MeshFormatError('mesh_vtp_xml', 'The VTP file is not valid XML.');
  const root = xml.documentElement;
  if (root.tagName !== 'VTKFile' || root.getAttribute('type') !== 'PolyData') {
    throw new MeshFormatError('mesh_vtp_type', 'The VTP file must contain VTK PolyData.');
  }
  if (root.getAttribute('compressor')) {
    throw new MeshFormatError('mesh_vtp_compressed', 'Compressed VTP arrays are not supported; export uncompressed ASCII PolyData.');
  }
  const array = (parent: Element | null, name?: string): number[] => {
    const elements = [...(parent?.querySelectorAll('DataArray') ?? [])];
    const element = name ? elements.find((item) => item.getAttribute('Name') === name) : elements[0];
    if (!element) throw new MeshFormatError('mesh_vtp_array_missing', `The VTP file is missing ${name ?? 'point coordinates'}.`);
    if (element.getAttribute('format')?.toLowerCase() !== 'ascii') {
      throw new MeshFormatError('mesh_vtp_array_format', `The VTP ${name ?? 'points'} array must be ASCII.`);
    }
    const values = (element.textContent ?? '').trim().split(/\s+/u).map(Number);
    if (!values.length || values.some((value) => !Number.isFinite(value))) {
      throw new MeshFormatError('mesh_vtp_array_values', `The VTP ${name ?? 'points'} array has invalid numbers.`);
    }
    return values;
  };
  const piece = root.querySelector('PolyData > Piece');
  if (!piece) throw new MeshFormatError('mesh_vtp_piece', 'The VTP file has no PolyData piece.');
  const positions = array(piece.querySelector('Points'));
  if (positions.length % 3) throw new MeshFormatError('mesh_vtp_points', 'The VTP point array must have x, y, z triples.');
  const polys = piece.querySelector('Polys');
  const connectivity = array(polys, 'connectivity');
  const offsets = array(polys, 'offsets');
  const indices: number[] = [];
  let begin = 0;
  for (const end of offsets) {
    if (!Number.isInteger(end) || end < begin + 3 || end > connectivity.length) {
      throw new MeshFormatError('mesh_vtp_polys', 'The VTP polygon offsets are invalid.');
    }
    for (let i = begin + 1; i < end - 1; i += 1) indices.push(connectivity[begin]!, connectivity[i]!, connectivity[i + 1]!);
    begin = end;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function flattenGeometry(root: THREE.Object3D, format: MeshFormat): ParsedFeaMesh {
  root.updateWorldMatrix(true, true);
  const positions: number[] = [];
  const triangles: number[] = [];
  const colors: number[] = [];
  const nodeIds: number[] = [];
  const nodesByPosition = new Map<string, number>();
  let textured = false;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.geometry as THREE.BufferGeometry;
    const position = source.getAttribute('position');
    if (!position) return;
    const index = source.getIndex();
    const count = index?.count ?? position.count;
    if (count % 3) throw new MeshFormatError('mesh_triangles', `${format.toUpperCase()} contains non-triangle faces.`);
    const offset = positions.length / 3;
    const point = new THREE.Vector3();
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
    const tint = material?.color ?? new THREE.Color('#9db5ca');
    const vertexColor = source.getAttribute('color');
    textured ||= Boolean(material?.map);
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      positions.push(point.x, point.y, point.z);
      // OBJ and other triangle soups repeat vertices at face seams. Give
      // coincident positions one spatial node id for selection and reference.
      const key = `${point.x},${point.y},${point.z}`;
      let nodeId = nodesByPosition.get(key);
      if (nodeId === undefined) {
        nodeId = nodesByPosition.size;
        nodesByPosition.set(key, nodeId);
      }
      nodeIds.push(nodeId);
      colors.push(tint.r * (vertexColor?.getX(i) ?? 1), tint.g * (vertexColor?.getY(i) ?? 1), tint.b * (vertexColor?.getZ(i) ?? 1));
    }
    for (let i = 0; i < count; i += 1) triangles.push(offset + (index?.getX(i) ?? i));
  });
  if (!triangles.length) throw new MeshFormatError('mesh_no_triangles', `${format.toUpperCase()} contains no triangle mesh to display.`);
  if (positions.some((value) => !Number.isFinite(value))) throw new MeshFormatError('mesh_coordinates', `${format.toUpperCase()} has non-finite vertex coordinates.`);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  geometry.dispose();
  return {
    positions: Float32Array.from(positions),
    triangles: Uint32Array.from(triangles),
    nodeIndex: Float32Array.from(nodeIds),
    topology: 'surface',
    fields: [],
    frames: [],
    cells: 0,
    bounds: { min: box.min.toArray(), max: box.max.toArray() },
    baseColors: Float32Array.from(colors),
    sourceFormat: format,
    warnings: textured ? ['Texture images are not shown; the viewport uses the model’s material colours.'] : [],
  };
}

/** Decode a registered standard mesh into the viewport's triangle representation. */
export async function parseMeshArtifact(bytes: Uint8Array, hint?: MeshFormat, materialBytes?: Uint8Array): Promise<ParsedFeaMesh> {
  const format = hint ?? detectedFormat(bytes);
  if (!format) throw new MeshFormatError('mesh_format_unknown', 'The mesh format could not be identified; set the viewport format to glb, gltf, obj, stl, ply, fbx, 3mf, vtk, vtp, or drc.');
  const buffer = bufferOf(bytes);
  let root: THREE.Object3D;
  try {
    switch (format) {
      case 'glb':
      case 'gltf': {
        checkContainedGltf(bytes, format);
        const draco = new DRACOLoader().setDecoderPath('/draco/');
        const loader = new GLTFLoader().setDRACOLoader(draco);
        try {
          const gltf = await loader.parseAsync(format === 'gltf' ? decoder.decode(bytes) : buffer, '');
          if ((gltf.scene.userData as { clio?: { contract?: string } }).clio?.contract === 'clio.fea-mesh.v1') {
            const parsed = await parseFeaMesh(bytes);
            parsed.sourceFormat = format;
            return parsed;
          }
          root = gltf.scene;
        } finally {
          draco.dispose();
        }
        break;
      }
      case 'obj': {
        const loader = new OBJLoader();
        if (materialBytes) {
          const materials = new MTLLoader().parse(decoder.decode(materialBytes), '');
          materials.preload();
          loader.setMaterials(materials);
        }
        root = loader.parse(decoder.decode(bytes));
        break;
      }
      case 'stl': root = new THREE.Mesh(new STLLoader().parse(buffer)); break;
      case 'ply': {
        const ascii = /^ply\r?\nformat ascii /u.test(decoder.decode(bytes.subarray(0, 40)));
        root = new THREE.Mesh(new PLYLoader().parse(ascii ? decoder.decode(bytes) : buffer));
        break;
      }
      case 'fbx': root = new FBXLoader().parse(buffer, ''); break;
      case '3mf': root = new ThreeMFLoader().parse(buffer); break;
      case 'vtk': {
        // Three's VTKLoader reads a fixed 250-byte prefix even for tiny valid files.
        const input = bytes.length < 250 ? bufferOf(Uint8Array.from({ length: 250 }, (_, index) => bytes[index] ?? 32)) : buffer;
        root = new THREE.Mesh(new VTKLoader().parse(input, ''));
        break;
      }
      case 'vtp': root = new THREE.Mesh(parseVtp(bytes)); break;
      case 'drc': {
        const loader = new DRACOLoader().setDecoderPath('/draco/');
        try {
          const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => loader.parse(buffer, resolve, reject));
          root = new THREE.Mesh(geometry);
        } finally {
          loader.dispose();
        }
        break;
      }
    }
    return flattenGeometry(root, format);
  } catch (error) {
    if (error instanceof MeshFormatError) throw error;
    throw new MeshFormatError('mesh_parse_failed', `${format.toUpperCase()} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}
