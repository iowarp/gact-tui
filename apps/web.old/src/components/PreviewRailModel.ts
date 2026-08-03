/**
 * View-model / pure logic for Preview Rail: state shaping and helpers, no DOM. Key export `TEXT_PREVIEW_CAP`.
 */
import type { ContextFileContent } from '@clio/core';
import { extOf, imageMimeForPath, langForPath } from './PreviewRailFileTypes.js';

export {
  buildTree,
  findTreeNode,
  flattenVisible,
  normalizePath,
  splitPath,
} from './PreviewRailTreeModel.js';
export { humanSize, imageFailureHint } from './PreviewRailDiagnostics.js';
export { extOf, imageMimeForPath, langForPath } from './PreviewRailFileTypes.js';
export type { TreeNode } from './PreviewRailTreeModel.js';

export const TEXT_PREVIEW_CAP = 512 * 1024;

export type PreviewKind = 'image' | 'text' | 'binary';

export interface PreviewHighlighter {
  highlight(source: string, options: { language: string }): { value: string };
}

export function classifyPreview(content: ContextFileContent): PreviewKind {
  const mt = (content.media_type || '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (imageMimeForPath(content.path)) return 'image';
  const texty =
    mt.startsWith('text/') ||
    mt.includes('json') ||
    mt.includes('xml') ||
    mt.includes('javascript') ||
    mt.includes('typescript') ||
    mt.includes('yaml') ||
    mt === 'application/octet-stream';
  if (!texty) return 'binary';
  if (content.size > TEXT_PREVIEW_CAP) return 'binary';
  return 'text';
}

export function decodeText(content: ContextFileContent): string {
  try {
    const bin = atob(content.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function previewDataUrl(
  content: ContextFileContent | null,
  kind: PreviewKind | null,
): string {
  if (!content || kind !== 'image') return '';
  return `data:${imageMimeForPath(content.path) ?? content.media_type};base64,${content.data}`;
}

export function isMarkdownPreviewPath(path: string): boolean {
  return extOf(path) === 'md';
}

export function highlightedPreviewHtml(
  kind: PreviewKind | null,
  content: ContextFileContent | null,
  source: string,
  highlighter: PreviewHighlighter | null,
): string | null {
  if (kind !== 'text' || !content) return null;
  const lang = langForPath(content.path);
  if (highlighter && lang) {
    try {
      return highlighter.highlight(source, { language: lang }).value;
    } catch {
      // fall through to escaped plain text
    }
  }
  return escapeHtml(source);
}
