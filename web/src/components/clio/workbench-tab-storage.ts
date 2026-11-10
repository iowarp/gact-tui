import type { WorkbenchTab } from './workbench-shared';
import type { WorkbenchListView, WorkbenchTabListView } from './workbench-strip';
import { workbenchTabIcons } from './workbench-tab-icons';

export const sessionTab: WorkbenchTab = { id: 'session', kind: 'session', label: 'Timeline' };
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
  return { id: `list:${view}`, kind: 'list', label: WORKBENCH_LIST_TITLES[view], view };
}

const WORKBENCH_TABS_STORAGE_PREFIX = 'clio.workbench-tabs.v1';
const TAB_LIST_VIEWS = new Set<string>([
  'sources',
  'artifacts',
  'activity',
  'terminal',
  'browser',
] satisfies WorkbenchTabListView[]);

export interface RestoredWorkbench {
  tabs: WorkbenchTab[];
  activeTabId: string;
  /** Only Files has a column beside the tabs. */
  listView?: 'files';
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
    (row.kind !== 'list' || (typeof row.view === 'string' && TAB_LIST_VIEWS.has(row.view)))
  );
}

/** Lists now live on the strip; tabs older builds saved for them are not restored. */
function isListTab(tab: WorkbenchTab): boolean {
  return (
    tab.kind === 'artifacts' ||
    tab.kind === 'resources' ||
    (tab.kind === 'files' && tab.id === 'files')
  );
}

export function saveWorkbenchState(workspaceId: string, state: RestoredWorkbench): void {
  window.localStorage.setItem(
    workbenchTabsStorageKey(workspaceId),
    JSON.stringify({ ...state, listView: state.listView ?? null }),
  );
}

/** A fresh pocket opens on its Activity tab when there is a conversation (Timeline is one
 * row away there), or on the Files column for a workspace without one. */
export function restoredWorkbenchState(workspaceId: string, hasSession = true): RestoredWorkbench {
  const activity = listTab('activity');
  const fresh: RestoredWorkbench = hasSession
    ? { tabs: [activity], activeTabId: activity.id, pinnedIds: [] }
    : { tabs: [], activeTabId: '', listView: 'files', pinnedIds: [] };
  if (typeof window === 'undefined') return fresh;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(workbenchTabsStorageKey(workspaceId)) ?? 'null',
    ) as unknown;
    if (!parsed || typeof parsed !== 'object') return fresh;
    const record = parsed as Record<string, unknown>;
    const tabs = Array.isArray(record.tabs)
      ? record.tabs
          .filter(isWorkbenchTab)
          .filter((tab) => !isListTab(tab))
          .map((tab) =>
            tab.kind === 'knowledge'
              ? // Knowledge tabs saved by older builds carry a " (middle dot) Knowledge" suffix.
                { ...tab, label: tab.label.replace(/ \u00b7 Knowledge$/u, '') }
              : // Older builds named it Observability, then Activity.
                tab.kind === 'session' && ['Observability', 'Activity'].includes(String(tab.label))
                ? sessionTab
                : tab,
          )
      : [];
    let requestedActive = typeof record.activeTabId === 'string' ? record.activeTabId : '';
    let listView: 'files' | undefined;
    if (record.listView === 'files') listView = 'files';
    else if (typeof record.listView === 'string' && TAB_LIST_VIEWS.has(record.listView)) {
      // Older builds showed every list as a column: that list is now a tab, and in view.
      const migrated = listTab(record.listView as WorkbenchTabListView);
      if (!tabs.some((tab) => tab.id === migrated.id)) tabs.push(migrated);
      requestedActive = migrated.id;
    } else if (record.listView !== null && !tabs.length) return fresh;
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
      listView,
      pinnedIds,
    };
  } catch {
    return fresh;
  }
}
