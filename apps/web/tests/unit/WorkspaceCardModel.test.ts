import type { Workspace } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  humanWorkspaceDate,
  workspaceCreatedAt,
  workspaceRepoTokenLabel,
  workspaceRepoTreeText,
} from '../../src/routes/discovery/WorkspaceCardModel.js';

describe('WorkspaceCardModel', () => {
  it('reads optional workspace creation timestamps', () => {
    expect(
      workspaceCreatedAt({
        id: 'ws_alpha',
        name: 'Alpha',
        root_path: '/work/alpha',
        created_at: '2026-06-21T00:00:00Z',
      } as Workspace & { created_at: string }),
    ).toBe('2026-06-21T00:00:00Z');
    expect(
      workspaceCreatedAt({
        id: 'ws_beta',
        name: 'Beta',
        root_path: '/work/beta',
      } as Workspace),
    ).toBeNull();
  });

  it('formats valid dates and preserves invalid date text', () => {
    expect(humanWorkspaceDate('2026-06-21T18:00:00Z', 'en-US')).toBe(
      'Jun 21, 2026',
    );
    expect(humanWorkspaceDate('not-a-date', 'en-US')).toBe('not-a-date');
  });

  it('formats repo token labels only when nonzero tokens are present', () => {
    expect(workspaceRepoTokenLabel(42)).toBe('42t');
    expect(workspaceRepoTokenLabel(0)).toBeNull();
    expect(workspaceRepoTokenLabel(undefined)).toBeNull();
  });

  it('serializes repo map trees for compact display', () => {
    expect(workspaceRepoTreeText({ src: { 'index.ts': 'file' } })).toBe(
      '{\n  "src": {\n    "index.ts": "file"\n  }\n}',
    );
  });
});
