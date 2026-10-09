import type { DocumentProfile } from '@clio/core/v3';
import { fileFormatLabel } from '@/lib/media-types';
import type { DocumentApplication } from '@/tauri/documents';

export type DocumentSourceProfile = 'markdown' | 'html-static' | 'latex';

/** Only readable source formats expose a raw document view. */
export function isDocumentSourceProfile(
  profile: DocumentProfile,
): profile is DocumentSourceProfile {
  return ['markdown', 'html-static', 'latex'].includes(profile);
}

type OpenPolicy = {
  nativeLabel: string;
  applications: readonly DocumentApplication[];
  embeddedEditors: boolean;
  pdfPreview: boolean;
  previewLabel?: string;
  sourceLabel?: string;
};

const policies: Record<DocumentProfile, OpenPolicy> = {
  'html-static': {
    nativeLabel: 'Default HTML app',
    applications: [],
    embeddedEditors: false,
    pdfPreview: false,
    previewLabel: 'HTML preview',
    sourceLabel: 'HTML source',
  },
  markdown: {
    nativeLabel: 'Default text editor',
    applications: [],
    embeddedEditors: false,
    pdfPreview: true,
    previewLabel: 'Markdown preview',
    sourceLabel: 'Markdown source',
  },
  latex: {
    nativeLabel: 'Default text editor',
    applications: [],
    embeddedEditors: false,
    pdfPreview: true,
    sourceLabel: 'LaTeX source',
  },
  pdf: {
    nativeLabel: 'Default PDF viewer',
    applications: [],
    embeddedEditors: false,
    pdfPreview: true,
  },
  'ooxml-word': {
    nativeLabel: 'Default document app',
    applications: ['word'],
    embeddedEditors: true,
    pdfPreview: true,
  },
  'odf-text': {
    nativeLabel: 'Default document app',
    applications: ['word'],
    embeddedEditors: true,
    pdfPreview: true,
  },
  'ooxml-sheet': {
    nativeLabel: 'Default spreadsheet app',
    applications: ['excel'],
    embeddedEditors: true,
    pdfPreview: true,
  },
  'odf-sheet': {
    nativeLabel: 'Default spreadsheet app',
    applications: ['excel'],
    embeddedEditors: true,
    pdfPreview: true,
  },
  'ooxml-slides': {
    nativeLabel: 'Default presentation app',
    applications: ['powerpoint'],
    embeddedEditors: true,
    pdfPreview: true,
  },
  'odf-slides': {
    nativeLabel: 'Default presentation app',
    applications: ['powerpoint'],
    embeddedEditors: true,
    pdfPreview: true,
  },
  binary: {
    nativeLabel: 'Default desktop app',
    applications: [],
    embeddedEditors: false,
    pdfPreview: false,
  },
};

/** Derive targets from the original format, never from its derived preview. */
export function documentOpenPolicy(
  profile: DocumentProfile,
  name: string,
  mediaType: string,
): OpenPolicy {
  if (profile !== 'binary') return policies[profile];
  const type = mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  const defaults = policies.binary;
  if (
    type.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'avif'].includes(extension)
  )
    return { ...defaults, nativeLabel: 'Default image viewer' };
  if (type.startsWith('audio/') || ['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(extension))
    return { ...defaults, nativeLabel: 'Default audio player' };
  if (type.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv'].includes(extension))
    return { ...defaults, nativeLabel: 'Default video player' };
  if (
    ['csv', 'tsv'].includes(extension) ||
    ['text/csv', 'text/tab-separated-values'].includes(type)
  )
    return { ...defaults, nativeLabel: 'Default spreadsheet app', applications: ['excel'] };
  if (['zip', '7z', 'tar', 'gz', 'rar'].includes(extension) || type === 'application/zip')
    return { ...defaults, nativeLabel: 'Default archive app' };
  if (['glb', 'gltf', 'obj', 'stl', 'ply'].includes(extension) || type.startsWith('model/'))
    return { ...defaults, nativeLabel: 'Default 3D app' };
  const format = fileFormatLabel(name, type);
  return {
    ...defaults,
    nativeLabel: format === 'File' ? defaults.nativeLabel : `Default ${format} app`,
  };
}
