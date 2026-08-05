/**
 * Right-panel stack reducer (round-3 defect 1 — shift-click peek).
 *
 * The prototype routes a Call-box click by modifier: plain click → center
 * drill-in (setFocus), shift-click → RIGHT panel (setStack). SessionView's
 * `openChildByHandle` used to DROP the `{ peek }` third argument HandoffPart
 * passes, making shift-click identical to click (byte-identical DOM, round-3
 * dump). The routing now lands on this extracted reducer, pinned here.
 */
import { describe, expect, it } from 'vitest';
import {
  openRightEntry,
  patchTopArtifact,
  rightEntryLabel,
  type RightStackEntry,
} from '../../src/session/rightStack';
import type { ArtifactRecord } from '../../src/detail/types';

const RECORD: ArtifactRecord = {
  id: 'artifact_a1',
  kind: 'report',
  breadcrumb: ['session', 'report.md'],
};

const ARTIFACT_ENTRY: RightStackEntry = { kind: 'artifact', record: RECORD };
const PEEK_ENTRY: RightStackEntry = {
  kind: 'agent-peek',
  sessionId: 'sess_child',
  agent: 'geospatial',
  parentLabel: 'main',
};

describe('openRightEntry', () => {
  it('REPLACES the stack by default (prototype artGo/setStack semantics)', () => {
    const next = openRightEntry([ARTIFACT_ENTRY], PEEK_ENTRY);
    expect(next).toEqual([PEEK_ENTRY]);
  });

  it('PUSHES for provenance navigation (push: true)', () => {
    const second: RightStackEntry = {
      kind: 'artifact',
      record: { ...RECORD, id: 'artifact_b2' },
    };
    const next = openRightEntry([ARTIFACT_ENTRY], second, { push: true });
    expect(next).toHaveLength(2);
    expect(next[1]).toBe(second);
  });

  it('an agent-peek entry replaces an artifact stack — one slot, latest intent wins', () => {
    const next = openRightEntry([ARTIFACT_ENTRY, ARTIFACT_ENTRY], PEEK_ENTRY);
    expect(next).toEqual([PEEK_ENTRY]);
  });
});

describe('patchTopArtifact', () => {
  it('patches the top entry when it is still the fetched artifact', () => {
    const next = patchTopArtifact([ARTIFACT_ENTRY], 'artifact_a1', { sha: 'sha256:abc' });
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ kind: 'artifact', record: { ...RECORD, sha: 'sha256:abc' } });
  });

  it('leaves the stack untouched when a DIFFERENT artifact is now on top (late arrival)', () => {
    const stack = [{ kind: 'artifact', record: { ...RECORD, id: 'artifact_other' } } as RightStackEntry];
    expect(patchTopArtifact(stack, 'artifact_a1', { sha: 'x' })).toBe(stack);
  });

  it('leaves the stack untouched when an agent peek is on top', () => {
    const stack = [PEEK_ENTRY];
    expect(patchTopArtifact(stack, 'artifact_a1', { sha: 'x' })).toBe(stack);
  });

  it('leaves an empty stack untouched (panel closed before the fetch landed)', () => {
    const stack: RightStackEntry[] = [];
    expect(patchTopArtifact(stack, 'artifact_a1', { sha: 'x' })).toBe(stack);
  });

  it('patches only the top, preserving pushed history beneath it', () => {
    const bottom: RightStackEntry = {
      kind: 'artifact',
      record: { ...RECORD, id: 'artifact_bottom' },
    };
    const next = patchTopArtifact([bottom, ARTIFACT_ENTRY], 'artifact_a1', { note: 'n' });
    expect(next[0]).toBe(bottom);
    expect(next[1]).toEqual({ kind: 'artifact', record: { ...RECORD, note: 'n' } });
  });
});

describe('rightEntryLabel', () => {
  it('labels an artifact entry by its trailing breadcrumb', () => {
    expect(rightEntryLabel(ARTIFACT_ENTRY)).toBe('report.md');
  });

  it('falls back to the artifact id without a breadcrumb', () => {
    expect(rightEntryLabel({ kind: 'artifact', record: { id: 'artifact_x' } })).toBe('artifact_x');
  });

  it('labels an agent peek by the agent name', () => {
    expect(rightEntryLabel(PEEK_ENTRY)).toBe('geospatial');
  });
});
