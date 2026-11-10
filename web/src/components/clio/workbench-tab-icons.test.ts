import { describe, expect, it } from 'vitest';
import { overflowTabs } from './workbench-tab-icons';
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
