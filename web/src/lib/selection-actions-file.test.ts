// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fileTextSelection,
  lineRangeLabel,
  registerSelectionCommenter,
  selectionCommenter,
} from './selection-actions-file';

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

function viewer(attributes = 'data-file-path="ndp/soil_sites.csv" data-workspace-id="ws_1"') {
  document.body.innerHTML = `
    <div id="surface" data-selection-surface="file" ${attributes}>
      <pre><span id="l12" data-line="12">site,depth</span>
<span id="l13" data-line="13">north,0.25</span>
<span id="l14" data-line="14">south,0.40</span></pre>
      <input id="field" value="typed text" />
    </div>
    <div data-selection-surface="file" data-file-path="other.txt"><p id="other">elsewhere</p></div>
    <p id="outside">not a file</p>`;
}

function select(startId: string, start: number, endId: string, end: number) {
  const range = document.createRange();
  range.setStart(document.getElementById(startId)!.firstChild!, start);
  range.setEnd(document.getElementById(endId)!.firstChild!, end);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

describe('fileTextSelection', () => {
  it('reads a passage across numbered rows as the file, its lines and a text-quote anchor', () => {
    viewer();
    const target = fileTextSelection(select('l13', 0, 'l14', 5));

    expect(target).toMatchObject({
      kind: 'file-text',
      path: 'ndp/soil_sites.csv',
      name: 'soil_sites.csv',
      workspaceId: 'ws_1',
      startLine: 13,
      endLine: 14,
      text: 'north,0.25 south',
      anchor: {
        profile: 'text-quote',
        exact: 'north,0.25 south',
        source_path: 'ndp/soil_sites.csv',
        source: {
          path: 'ndp/soil_sites.csv',
          workspace_id: 'ws_1',
          lines: 'lines 13–14',
          line_start: 13,
          line_end: 14,
        },
      },
    });
    expect(target?.anchor.prefix).toContain('site,depth');
  });

  it('names one line, and a passage without numbered rows by its file only', () => {
    viewer();
    expect(fileTextSelection(select('l12', 0, 'l12', 4))).toMatchObject({
      startLine: 12,
      endLine: 12,
      anchor: { source: { lines: 'line 12' } },
    });
    const passage = fileTextSelection(select('other', 0, 'other', 4));
    expect(passage).toMatchObject({ path: 'other.txt', name: 'other.txt', text: 'else' });
    expect(passage?.startLine).toBeUndefined();
    expect(passage?.workspaceId).toBeUndefined();
  });

  it('offers nothing outside one file viewer, across two, or for a collapsed selection', () => {
    viewer();
    expect(fileTextSelection(select('outside', 0, 'outside', 3))).toBeUndefined();
    expect(fileTextSelection(select('l14', 0, 'other', 3))).toBeUndefined();
    expect(fileTextSelection(select('l12', 2, 'l12', 2))).toBeUndefined();
    expect(fileTextSelection(null)).toBeUndefined();
  });

  it('needs the file path the viewer names', () => {
    viewer('');
    expect(fileTextSelection(select('l12', 0, 'l12', 4))).toBeUndefined();
  });

  it('formats line ranges', () => {
    expect(lineRangeLabel()).toBe('');
    expect(lineRangeLabel(4, 4)).toBe('line 4');
    expect(lineRangeLabel(12, 18)).toBe('lines 12–18');
  });
});

describe('selection commenters', () => {
  it('finds the innermost registered element holding the selection, until unregistered', () => {
    viewer();
    const outer = vi.fn(() => true);
    const inner = vi.fn(() => true);
    const surface = document.getElementById('surface')!;
    const pre = surface.querySelector('pre')!;
    const dropOuter = registerSelectionCommenter(surface, outer);
    const dropInner = registerSelectionCommenter(pre, inner);
    const target = fileTextSelection(select('l13', 0, 'l13', 5))!;

    expect(selectionCommenter(target)).toBe(inner);
    dropInner();
    expect(selectionCommenter(target)).toBe(outer);
    dropOuter();
    expect(selectionCommenter(target)).toBeUndefined();
  });

  it('keeps a newer registration when an older one for the same element is dropped', () => {
    viewer();
    const surface = document.getElementById('surface')!;
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const dropFirst = registerSelectionCommenter(surface, first);
    registerSelectionCommenter(surface, second);
    dropFirst();
    expect(selectionCommenter({ container: surface })).toBe(second);
  });
});
