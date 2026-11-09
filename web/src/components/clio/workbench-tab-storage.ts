import type { WorkbenchTab } from './workbench-shared';
import type { WorkbenchListView } from './workbench-strip';
import { workbenchTabIcons } from './workbench-tab-icons';

export const sessionTab: WorkbenchTab = { id: 'session', kind: 'session', label: 'Timeline' };
export const workTab: WorkbenchTab = { id: 'work', kind: 'work', label: 'Work' };
export const agentTab: WorkbenchTab = { id: 'agent', kind: 'agent', label: 'Agent' };

const WORKBENCH_TABS_STORAGE_PREFIX = 'clio.workbench-tabs.v1';
const LIST_VIEWS = new Set<string>([
  'files',
  'sources',
  'artifacts',
  'activity',
  'terminal',
  'browser',
] satisfies WorkbenchListView[]);

export interface RestoredWorkbench {
  tabs: WorkbenchTab[];
  activeTabId: string;
  listView?: WorkbenchListView;
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
    typeof row.label === 'string'
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

/** A fresh pocket opens no tab: a conversation starts on its Activity list (Timeline is one
 * row away there), a workspace without one on Files. */
export function restoredWorkbenchState(workspaceId: string, hasSession = true): RestoredWorkbench {
  const defaultTabs: WorkbenchTab[] = [];
  const defaultList: WorkbenchListView = hasSession ? 'activity' : 'files';
  const fresh: RestoredWorkbench = {
    tabs: defaultTabs,
    activeTabId: '',
    listView: defaultList,
    pinnedIds: [],
  };
  if (typeof window === 'undefined') return fresh;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(workbenchTabsStorageKey(workspaceId)) ?? 'null',
    ) as unknown;
    if (!parsed || typeof parsed !== 'object') return fresh;
    const record = parsed as Record<string, unknown>;
    const storedTabs = Array.isArray(record.tabs)
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
    const tabs = storedTabs.length ? storedTabs : defaultTabs;
    const requestedActive = typeof record.activeTabId === 'string' ? record.activeTabId : '';
    const listView =
      record.listView === null
        ? undefined
        : typeof record.listView === 'string' && LIST_VIEWS.has(record.listView)
          ? (record.listView as WorkbenchListView)
          : defaultList;
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
