import type { MeshFormat } from './mesh-viewport-formats';

/**
 * CAD and mesh files the file viewer shows in 3D, by name. A STEP is text and an ASCII
 * STL can arrive as `text/plain`, so the name decides before the text viewers do.
 */
const CAD_FORMATS: Record<string, MeshFormat> = {
  step: 'step',
  stp: 'step',
  stl: 'stl',
  '3mf': '3mf',
  obj: 'obj',
  ply: 'ply',
  glb: 'glb',
  gltf: 'gltf',
};

/** The 3D format a file's name says it holds, or undefined when it is not one. */
export function cadFormatOf(path: string): MeshFormat | undefined {
  const base = path.split(/[\\/]/u).at(-1) ?? '';
  if (!base.includes('.')) return undefined;
  return CAD_FORMATS[base.split('.').at(-1)!.toLowerCase()];
}

/** The media type the viewer reports for a 3D file, used where a listing gives none. */
export const CAD_MEDIA_TYPES: Partial<Record<MeshFormat, string>> = {
  step: 'model/step',
  stl: 'model/stl',
  '3mf': 'model/3mf',
  obj: 'model/obj',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  ply: 'application/octet-stream',
};
