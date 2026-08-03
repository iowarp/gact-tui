import { describe, expect, it } from 'vitest';
import {
  buildTree,
  classifyPreview,
  flattenVisible,
  highlightedPreviewHtml,
  imageFailureHint,
  isMarkdownPreviewPath,
  previewDataUrl,
} from '../../src/components/PreviewRail.js';
import type { ContextFileContent, WorkspaceFileEntry } from '@clio/core';

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

// Windows-native separators come back from clio on a Windows host - the tree
// builder must handle both '\' and '/'.
const SAMPLE: WorkspaceFileEntry[] = [
  { path: 'src', type: 'dir' },
  { path: 'src\\app.ts', type: 'file', size: 120 },
  { path: 'src/util/helpers.ts', type: 'file', size: 30 },
  { path: 'README.md', type: 'file', size: 64 },
  { path: 'logo.png', type: 'file', size: 2048 },
];

describe('PreviewRail tree model', () => {
  it('nests files under synthesized + explicit dirs, sorted dirs-first', () => {
    const tree = buildTree(SAMPLE);
    const names = tree.map((n) => n.name);
    expect(names).toEqual(['src', 'logo.png', 'README.md']);
    const src = tree.find((n) => n.name === 'src')!;
    expect(src.type).toBe('dir');
    const childNames = src.children.map((c) => c.name);
    expect(childNames).toEqual(['util', 'app.ts']);
    const util = src.children.find((c) => c.name === 'util')!;
    expect(util.children[0]?.path).toBe('src/util/helpers.ts');
  });

  it('only shows top-level rows when nothing is expanded', () => {
    const tree = buildTree(SAMPLE);
    const rows = flattenVisible(tree, new Set(), '');
    expect(rows.map((r) => r.node.name)).toEqual([
      'src',
      'logo.png',
      'README.md',
    ]);
  });

  it('expands a dir to reveal its children at depth+1', () => {
    const tree = buildTree(SAMPLE);
    const rows = flattenVisible(tree, new Set(['src']), '');
    const src = rows.find((r) => r.node.name === 'src')!;
    const app = rows.find((r) => r.node.name === 'app.ts')!;
    expect(app.depth).toBe(src.depth + 1);
  });

  it('filtering matches files by path and force-expands ancestors', () => {
    const tree = buildTree(SAMPLE);
    const rows = flattenVisible(tree, new Set(), 'helpers');
    const names = rows.map((r) => r.node.name);
    expect(names).toContain('helpers.ts');
    expect(names).toContain('util');
    expect(names).not.toContain('logo.png');
  });
});

describe('PreviewRail preview classification', () => {
  const base = { path: 'x', size: 10, encoding: 'base64' as const, data: '' };

  it('classifies images', () => {
    expect(classifyPreview({ ...base, media_type: 'image/png' })).toBe('image');
  });

  it('classifies text/code', () => {
    expect(classifyPreview({ ...base, media_type: 'text/plain' })).toBe('text');
    expect(
      classifyPreview({ ...base, media_type: 'application/json' }),
    ).toBe('text');
  });

  it('classifies unknown binary', () => {
    expect(
      classifyPreview({ ...base, media_type: 'application/pdf' }),
    ).toBe('binary');
  });

  it('treats oversized text as binary', () => {
    expect(
      classifyPreview({
        ...base,
        media_type: 'text/plain',
        size: 2 * 1024 * 1024,
      }),
    ).toBe('binary');
  });
});

describe('PreviewRail preview derivation helpers', () => {
  const textContent: ContextFileContent = {
    path: 'README.md',
    size: 11,
    media_type: 'text/plain',
    encoding: 'base64',
    data: b64('hello <world>'),
  };
  const imageContent: ContextFileContent = {
    path: 'logo.png',
    size: 10,
    media_type: 'application/octet-stream',
    encoding: 'base64',
    data: TINY_PNG,
  };

  it('builds image data URLs only for image previews', () => {
    expect(previewDataUrl(imageContent, 'image')).toBe(
      `data:image/png;base64,${TINY_PNG}`,
    );
    expect(previewDataUrl(imageContent, 'text')).toBe('');
    expect(previewDataUrl(null, 'image')).toBe('');
  });

  it('detects markdown preview paths', () => {
    expect(isMarkdownPreviewPath('README.md')).toBe(true);
    expect(isMarkdownPreviewPath('notes.MD')).toBe(true);
    expect(isMarkdownPreviewPath('README.txt')).toBe(false);
  });

  it('highlights text when a language highlighter is available', () => {
    expect(
      highlightedPreviewHtml('text', textContent, 'hello', {
        highlight: (source, options) => ({
          value: `${options.language}:${source}`,
        }),
      }),
    ).toBe('markdown:hello');
  });

  it('falls back to escaped text when highlighting is unavailable or throws', () => {
    expect(highlightedPreviewHtml('text', textContent, 'hello <world>', null)).toBe(
      'hello &lt;world&gt;',
    );
    expect(
      highlightedPreviewHtml('text', textContent, 'hello <world>', {
        highlight: () => {
          throw new Error('bad grammar');
        },
      }),
    ).toBe('hello &lt;world&gt;');
    expect(highlightedPreviewHtml('image', textContent, 'hello', null)).toBeNull();
  });

  it('explains image decode failures caused by JSON/text payloads or transformed bytes', () => {
    const content: ContextFileContent = {
      path: 'plot.png',
      size: 84,
      media_type: 'image/png',
      encoding: 'base64',
      data: b64('{"error":"not raw image bytes"}'),
    };

    expect(imageFailureHint(content, 68)).toContain('JSON/text');
    expect(imageFailureHint(content, 68)).toContain('84 B read, 68 B listed');
  });

  it('explains binary image reads transformed by a text/plain backend response', () => {
    const content: ContextFileContent = {
      path: 'plot.png',
      size: 84,
      media_type: 'image/png',
      source_media_type: 'text/plain',
      encoding: 'base64',
      data: b64('\u{fffd}PNG\r\n'),
    };

    expect(imageFailureHint(content, 68)).toContain(
      'Backend read returned text/plain for a image/png file',
    );
    expect(imageFailureHint(content, 68)).toContain('transformed the bytes');
  });
});
