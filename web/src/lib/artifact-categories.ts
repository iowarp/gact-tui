import type { Artifact } from '@clio/core/v3';

export const ARTIFACT_CATEGORIES = [
  { value: 'plans', label: 'Plans' },
  { value: 'scripts', label: 'Scripts' },
  { value: 'images', label: 'Images' },
  { value: 'slides', label: 'Slides' },
  { value: 'models', label: '3D models' },
  { value: 'data', label: 'Data' },
  { value: 'documents', label: 'Documents' },
  { value: 'other', label: 'Other' },
] as const;

export type ArtifactCategory = (typeof ARTIFACT_CATEGORIES)[number]['value'];

const SCRIPT_EXTENSIONS = new Set([
  'py',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'bat',
  'cmd',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'r',
  'jl',
  'lua',
  'rb',
  'pl',
  'ipynb',
]);
const MODEL_EXTENSIONS = new Set(['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', 'usd', 'usdz']);

/** Use file type plus extension when the registry only reports octet-stream. */
export function fileCategory(name: string, mediaType: string): ArtifactCategory {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  const mime = mediaType.split(';')[0].trim().toLowerCase();
  if (MODEL_EXTENSIONS.has(extension) || mime.startsWith('model/')) return 'models';
  if (SCRIPT_EXTENSIONS.has(extension) || /(?:javascript|python|shellscript)/u.test(mime)) {
    return 'scripts';
  }
  if (mime.startsWith('image/') || /^(png|jpe?g|gif|webp|svg|bmp|tiff?|avif)$/u.test(extension)) {
    return 'images';
  }
  if (/^(pptx?|odp)$/u.test(extension) || /(?:presentation|powerpoint)/u.test(mime)) {
    return 'slides';
  }
  if (
    /^(csv|tsv|json|jsonl|ndjson|ya?ml|xlsx?|ods|parquet|arrow|hdf5?|h5|nc|npy|npz)$/u.test(
      extension,
    ) ||
    /(?:json|spreadsheet|excel|parquet|csv|tab-separated)/u.test(mime)
  )
    return 'data';
  if (/^(md|markdown|txt|pdf|docx?|odt|rtf|html?)$/u.test(extension) || mime.startsWith('text/')) {
    return 'documents';
  }
  return 'other';
}

/** Plans retain their recorded designation, with the existing legacy naming fallback. */
export function artifactCategory(artifact: Artifact): ArtifactCategory {
  if (
    artifact.producer?.['designation'] === 'plan' ||
    /^plan[-_].*\.(md|markdown|pdf|txt)$/iu.test(artifact.name)
  )
    return 'plans';
  return fileCategory(artifact.name, artifact.media_type);
}

/** Combine category and case-insensitive filename/type search without changing records. */
export function filterArtifacts(
  artifacts: readonly Artifact[],
  query: string,
  category: ArtifactCategory | 'all',
): Artifact[] {
  const normalized = query.trim().toLocaleLowerCase();
  return artifacts.filter(
    (artifact) =>
      (category === 'all' || artifactCategory(artifact) === category) &&
      (!normalized ||
        `${artifact.name} ${artifact.media_type}`.toLocaleLowerCase().includes(normalized)),
  );
}
