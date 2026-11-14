import * as THREE from 'three';
import { t } from '@lingui/core/macro';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';
import { MeshFormatError } from './mesh-viewport-formats';

/**
 * STEP (ISO 10303-21) through OpenCASCADE compiled to WebAssembly (`occt-import-js`,
 * LGPL-2.1). This module, the reader's script and its WebAssembly load only when a STEP
 * file opens; the reader ships unmodified as its own replaceable files.
 */

interface OcctMesh {
  name: string;
  color?: [number, number, number];
  attributes: { position: { array: ArrayLike<number> }; normal?: { array: ArrayLike<number> } };
  index: { array: ArrayLike<number> };
}

interface OcctNode {
  name: string;
  meshes: number[];
  children: OcctNode[];
}

interface OcctResult {
  success: boolean;
  root: OcctNode;
  meshes: OcctMesh[];
}

interface OcctModule {
  ReadStepFile: (content: Uint8Array, params: Record<string, unknown> | null) => OcctResult;
}

let reader: Promise<OcctModule> | undefined;

function loadReader(): Promise<OcctModule> {
  reader ??= import('occt-import-js')
    .then((module) => {
      const factory = (module.default ?? module) as unknown as (options: {
        locateFile: (name: string) => string;
      }) => Promise<OcctModule>;
      return factory({ locateFile: () => occtWasmUrl });
    })
    .catch((error: unknown) => {
      reader = undefined;
      throw new MeshFormatError(
        'cad_step_reader_unavailable',
        t`The STEP reader could not start here: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  return reader;
}

/** Each mesh's name from the assembly tree: the nearest named node that holds it. */
function meshNames(root: OcctNode): Map<number, string> {
  const names = new Map<number, string>();
  const visit = (node: OcctNode, inherited: string) => {
    const name = node.name || inherited;
    for (const mesh of node.meshes) names.set(mesh, name);
    for (const child of node.children) visit(child, name);
  };
  visit(root, '');
  return names;
}

/** The STEP's solids as named, coloured meshes, one per part, in millimetres. */
export async function readStepModel(bytes: Uint8Array): Promise<THREE.Object3D> {
  const occt = await loadReader();
  let result: OcctResult;
  try {
    // Millimetres: what a print plate and a slicer measure in.
    result = occt.ReadStepFile(bytes, { linearUnit: 'millimeter' });
  } catch (error) {
    throw new MeshFormatError(
      'cad_step_read_failed',
      t`The STEP file could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!result.success)
    throw new MeshFormatError('cad_step_invalid', t`The STEP file could not be read.`);
  const names = meshNames(result.root);
  const group = new THREE.Group();
  result.meshes.forEach((source, index) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(Array.from(source.attributes.position.array), 3),
    );
    geometry.setIndex(Array.from(source.index.array));
    const material = new THREE.MeshStandardMaterial();
    // occt-import-js reports colours in linear RGB, the working space of three's colours.
    if (source.color) material.color.setRGB(...source.color, THREE.LinearSRGBColorSpace);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = source.name || names.get(index) || '';
    mesh.userData = { declaredColor: Boolean(source.color) };
    group.add(mesh);
  });
  return group;
}
