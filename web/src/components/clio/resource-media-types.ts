/** How the resource viewers recognise a file's kind from its media type and name. */
import { NOTEBOOK_MEDIA_TYPE, textFileFormat } from '@/lib/file-presentation';

export const HDF5_MEDIA_TYPE = 'application/x-hdf5';

export function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? path
  );
}

export function isTextArtifact(mediaType: string, name: string): boolean {
  return (
    mediaType.startsWith('text/') ||
    [
      'application/json',
      'application/yaml',
      'application/x-yaml',
      'application/x-ipynb+json',
    ].includes(mediaType) ||
    [
      'c',
      'cpp',
      'css',
      'csv',
      'go',
      'html',
      'htm',
      'ipynb',
      'java',
      'js',
      'json',
      'jsx',
      'md',
      'mmd',
      'mermaid',
      'py',
      'rs',
      'sh',
      'toml',
      'ts',
      'tsx',
      'txt',
      'yaml',
      'yml',
      // Logs, job output and plain configuration read as text.
      'log',
      'out',
      'err',
      'tsv',
      'ini',
      'cfg',
      'conf',
      // LaTeX sources: a paper's .tex opens as the LaTeX workspace; the rest as text.
      'tex',
      'ltx',
      'bib',
      'bst',
      'cls',
      'sty',
      // Patches read as their changed lines.
      'patch',
      'diff',
    ].includes(name.split('.').at(-1)?.toLowerCase() ?? '')
  );
}

export function isImageArtifact(mediaType: string, name: string): boolean {
  return (
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'].includes(
      mediaType,
    ) || isImagePath(name)
  );
}

function isImagePath(path: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(
    path.split('.').at(-1)?.toLowerCase() ?? '',
  );
}

export function isMarkdownArtifact(mediaType: string, name: string): boolean {
  return textFileFormat(name, mediaType) === 'markdown';
}

export function isDocumentArtifact(mediaType: string, name: string): boolean {
  if (
    [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
    ].includes(mediaType)
  ) {
    return true;
  }
  return [
    'md',
    'markdown',
    'pdf',
    'tex',
    'html',
    'htm',
    'docx',
    'xlsx',
    'pptx',
    'odt',
    'ods',
    'odp',
  ].includes(name.split('.').at(-1)?.toLowerCase() ?? '');
}

export function imageMediaType(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (extension === 'svg') return 'image/svg+xml';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'avif') return 'image/avif';
  return 'image/png';
}

export function inferredWorkspaceMediaType(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (isImagePath(path)) return imageMediaType(path);
  if (extension === 'json') return 'application/json';
  if (extension === 'ipynb') return NOTEBOOK_MEDIA_TYPE;
  if (extension === 'xml') return 'application/xml';
  if (extension === 'mmd' || extension === 'mermaid') return 'text/vnd.mermaid';
  // HDF5 and formats built on it (HDF-EOS5, NeXus, NetCDF-4). `.hdf` is left out: it is
  // usually HDF4. A classic NetCDF `.nc` is recognised by its first bytes and has no viewer.
  if (['h5', 'hdf5', 'he5', 'nxs', 'nc', 'nc4'].includes(extension ?? '')) return HDF5_MEDIA_TYPE;
  if (isTextArtifact('', path)) return 'text/plain';
  return 'application/octet-stream';
}

export function isSvg(mediaType: string): boolean {
  return mediaType.split(';', 1)[0]?.trim() === 'image/svg+xml';
}
