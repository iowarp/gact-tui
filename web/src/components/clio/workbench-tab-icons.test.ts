import { describe, expect, it } from 'vitest';
import type { Artifact } from '@clio/core/v3';
import { overflowTabs, workbenchTabVersions } from './workbench-tab-icons';
import type { WorkbenchTab } from './workbench-shared';

const tab = (id: string): WorkbenchTab => ({
  id,
  kind: 'knowledge',
  sourceId: id,
  label: id,
  workspaceId: 'w',
});

const ids = (tabs: readonly WorkbenchTab[]) => tabs.map((item) => item.id);

describe('overflowTabs', () => {
  const tabs = ['a', 'b', 'c', 'd', 'e'].map(tab);

  it('lists the least recently used tabs, most recent first, and never the open tab', () => {
    expect(ids(overflowTabs(tabs, 'a', ['a', 'c', 'e', 'b', 'd'], 2))).toEqual(['b', 'd']);
  });

  it('ranks tabs that were never in front after used ones, newest opened first', () => {
    expect(ids(overflowTabs(tabs, 'c', ['c', 'a'], 1))).toEqual(['e', 'd', 'b']);
  });

  it('lists nothing when every other tab fits', () => {
    expect(overflowTabs(tabs, 'a', ['a'], 4)).toEqual([]);
  });
});

describe('workbenchTabVersions', () => {
  const artifact = (id: string, version: number, name = 'qa-notes.md'): WorkbenchTab =>
    ({
      id,
      kind: 'artifact',
      artifact: { id, name, version, session_id: 's', media_type: 'text/markdown' } as Artifact,
    }) as WorkbenchTab;

  it('tags the versions of one file open side by side, and nothing else', () => {
    const versions = workbenchTabVersions([
      artifact('n1', 1),
      artifact('n2', 2),
      artifact('p1', 3, 'plot.png'),
      tab('qa-notes.md'),
    ]);
    expect(Object.fromEntries(versions)).toEqual({ n1: 'v1', n2: 'v2' });
  });
});