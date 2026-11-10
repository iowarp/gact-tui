import type { WorkbenchTab } from './workbench-shared';
import type { WorkbenchListView, WorkbenchTabListView } from './workbench-strip';
import { workbenchTabIcons } from './workbench-tab-icons';

export const workTab: WorkbenchTab = { id: 'work', kind: 'work', label: 'Work' };
export const agentTab: WorkbenchTab = { id: 'agent', kind: 'agent', label: 'Agent' };

export const WORKBENCH_LIST_TITLES: Record<WorkbenchListView, string> = {
  files: 'Files',
  sources: 'Sources',
  artifacts: 'Artifacts',
  activity: 'Activity',
  terminal: 'Terminal',
  browser: 'Browser pages',
};

/** The tab a strip list opens as; one per list, so the strip focuses it rather than adding more. */
export function listTab(view: WorkbenchTabListView): WorkbenchTab {
  return { id: `list:${view}` as const, kind: 'list', label: WORKBENCH_LIST_TITLES[view], view };
}

const WORKBENCH_TABS_STORAGE_PREFIX = 'clio.workbench-tabs.v1';
const TAB_LIST_VIEWS = new Set<string>([
  'files',
  'sources',
  'artifacts',
  'activity',
  'terminal',
  'browser',
] satisfies WorkbenchTabListView[]);

export interface RestoredWorkbench {
  tabs: WorkbenchTab[];
  activeTabId: string;
  pinnedIds: string[];
}

function workbenchTabsStorageKey(workspaceId: string): string {
  return `${WORKBENCH_TABS_STORAGE_PREFIX}:${workspaceId}`;
}

function isWorkbenchTab(value: unknown): value is WorkbenchTab {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.kind === 'string' &&
    row.kind in workbenchTabIcons &&
    typeof row.label === 'string' &&
    (row.kind !== 'list' || (typeof row.view === 'string' && TAB_LIST_VIEWS.has(row.view))) &&
    (row.backTo === undefined || (typeof row.backTo === 'string' && TAB_LIST_VIEWS.has(row.backTo)))
  );
}

/** Tabs older builds saved for lists (now on the strip) are not restored. */
function isLegacyListTab(tab: WorkbenchTab): boolean {
  return (
    tab.kind === 'artifacts' ||
    tab.kind === 'resources' ||
    (tab.kind === 'files' && tab.id === 'files')
  );
}

/** The timeline and context tab older builds saved is now the Activity tab's Timeline and Context. */
function migratedTab(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  return (value as Record<string, unknown>).kind === 'session' ? listTab('activity') : value;
}

export function saveWorkbenchState(workspaceId: string, state: RestoredWorkbench): void {
  window.localStorage.setItem(workbenchTabsStorageKey(workspaceId), JSON.stringify(state));
}

/** A fresh pocket opens on its Activity tab when there is a conversation, or on
 * the Files tab for a workspace without one. */
export function restoredWorkbenchState(workspaceId: string, hasSession = true): RestoredWorkbench {
  const first = listTab(hasSession ? 'activity' : 'files');
  const fresh: RestoredWorkbench = { tabs: [first], activeTabId: first.id, pinnedIds: [] };
  if (typeof window === 'undefined') return fresh;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(workbenchTabsStorageKey(workspaceId)) ?? 'null',
    ) as unknown;
    if (!parsed || typeof parsed !== 'object') return fresh;
    const record = parsed as Record<string, unknown>;
    const tabs: WorkbenchTab[] = [];
    if (Array.isArray(record.tabs))
      for (const raw of record.tabs) {
        const candidate = migratedTab(raw);
        if (!isWorkbenchTab(candidate) || isLegacyListTab(candidate)) continue;
        if (tabs.some((tab) => tab.id === candidate.id)) continue;
        tabs.push(
          candidate.kind === 'knowledge'
            ? // Knowledge tabs saved by older builds carry a " (middle dot) Knowledge" suffix.
              { ...candidate, label: candidate.label.replace(/ \u00b7 Knowledge$/u, '') }
            : candidate,
        );
      }
    let requestedActive = typeof record.activeTabId === 'string' ? record.activeTabId : '';
    if (requestedActive === 'session') requestedActive = listTab('activity').id;
    if (typeof record.listView === 'string' && TAB_LIST_VIEWS.has(record.listView)) {
      // Older builds showed lists as a column: that list is now a tab. Files was the
      // column beside the tabs, so it stays behind the tab that was shown.
      const migrated = listTab(record.listView as WorkbenchTabListView);
      if (!tabs.some((tab) => tab.id === migrated.id)) tabs.push(migrated);
      if (record.listView !== 'files' || !tabs.some((tab) => tab.id === requestedActive))
        requestedActive = migrated.id;
    }
    if (!tabs.length) return fresh;
    const pinnedIds = Array.isArray(record.pinnedIds)
      ? record.pinnedIds.filter(
          (id): id is string => typeof id === 'string' && tabs.some((tab) => tab.id === id),
        )
      : [];
    return {
      tabs,
      activeTabId: tabs.some((tab) => tab.id === requestedActive)
        ? requestedActive
        : (tabs[0]?.id ?? ''),
      pinnedIds,
    };
  } catch {
    return fresh;
  }
}
