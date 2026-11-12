import type { SubagentRun } from '@clio/core/v3';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { closeEmbeddedTerminalTab } from '@/tauri/workspace-terminal';
import { forgetRememberedViews, rememberedViewScope } from './remembered-view';
import { useScienceLogTab } from './science-log-tab-state';
import { fileName, subagentTab, type WorkbenchTab } from './workbench-shared';
import { restoredWorkbenchState, saveWorkbenchState } from './workbench-tab-storage';
import { useReleaseClosedTabData } from './workbench-tab-release';

/**
 * The workbench's open tabs and pins: restored per workspace,
 * saved on every change, and the operations that open, close and order tabs.
 */
export function useWorkbenchTabState(
  workspaceId: string,
  sessionId: string,
  inStudy: boolean | undefined,
) {
  // Lazy useState initializer (not useRef().current, which reads a ref
  // during render) computes the restored state exactly once.
  const [initialState] = useState(() => restoredWorkbenchState(workspaceId));
  const [tabs, setTabs] = useState<WorkbenchTab[]>(initialState.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(initialState.activeTabId);
  const [pinnedIds, setPinnedIds] = useState<string[]>(initialState.pinnedIds);

  useEffect(() => {
    saveWorkbenchState(workspaceId, { activeTabId, tabs, pinnedIds });
  }, [activeTabId, pinnedIds, tabs, workspaceId]);
  useReleaseClosedTabData(tabs);
  // A closed tab's viewers open on their first view next time.
  const openIds = useRef<readonly string[]>([]);
  useEffect(() => {
    const open = new Set(tabs.map((tab) => tab.id));
    const closed = openIds.current.filter((id) => !open.has(id));
    openIds.current = [...open];
    forgetRememberedViews(closed.map((id) => rememberedViewScope(workspaceId, id)));
  }, [tabs, workspaceId]);

  const shown = useScienceLogTab(inStudy, sessionId, tabs, setTabs, activeTabId);
  const shownActiveTabId = shown.activeTabId;
  const pinned = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const orderedTabs = useMemo(
    () => [
      ...shown.tabs.filter((tab) => pinned.has(tab.id)),
      ...shown.tabs.filter((tab) => !pinned.has(tab.id)),
    ],
    [pinned, shown.tabs],
  );
  const activeTab = orderedTabs.find((tab) => tab.id === shownActiveTabId);

  const openTab = useCallback((tab: WorkbenchTab) => {
    setTabs((current) =>
      current.some((item) => item.id === tab.id)
        ? current.map((item) => (item.id === tab.id ? tab : item))
        : [...current, tab],
    );
    setActiveTabId(tab.id);
  }, []);
  // The latest tabs, for numbering instances opened faster than a render.
  const tabsRef = useRef(tabs);
  useLayoutEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  /** Opens `tab` as a new instance: the first keeps its id and label, later ones are numbered. */
  const openInstance = useCallback(
    (tab: WorkbenchTab) => {
      const taken = new Set(tabsRef.current.map((item) => item.id));
      let number = 1;
      let id = tab.id;
      while (taken.has(id)) {
        number += 1;
        id = `${tab.id}:${number}`;
      }
      const instance = {
        ...tab,
        id,
        label: number === 1 ? tab.label : `${tab.label} ${number}`,
      } as WorkbenchTab;
      tabsRef.current = [...tabsRef.current, instance];
      openTab(instance);
    },
    [openTab],
  );
  const openSubagentTab = useCallback(
    (subagent: SubagentRun) => openTab(subagentTab(subagent, workspaceId)),
    [openTab, workspaceId],
  );
  const replaceTab = useCallback((tabId: string, replacement: WorkbenchTab) => {
    setTabs((current) =>
      current.some((item) => item.id === replacement.id && item.id !== tabId)
        ? current.filter((item) => item.id !== tabId)
        : current.map((item) => (item.id === tabId ? replacement : item)),
    );
    setActiveTabId(replacement.id);
  }, []);
  const selectFilesPath = useCallback((tabId: string, path: string) => {
    setTabs((current) =>
      current.map((candidate) =>
        candidate.id === tabId && candidate.kind === 'files' ? { ...candidate, path } : candidate,
      ),
    );
  }, []);
  const selectWorkspaceFilePath = useCallback((tabId: string, path: string) => {
    setTabs((current) =>
      current.map((candidate) =>
        candidate.id === tabId && candidate.kind === 'workspace-file'
          ? { ...candidate, label: fileName(path), path, line: undefined, find: undefined }
          : candidate,
      ),
    );
  }, []);
  const closeTabs = (ids: readonly string[]) => {
    if (!ids.length) return;
    const closing = new Set(ids);
    const index = orderedTabs.findIndex((tab) => tab.id === shownActiveTabId);
    const next = tabs.filter((tab) => !closing.has(tab.id));
    setTabs(next);
    setPinnedIds((current) => current.filter((id) => !closing.has(id)));
    for (const tab of tabs) {
      // The pty and its xterm instance live in the module-level registry,
      // keyed by tab id — a closed tab is the one place that registry
      // entry is ever explicitly torn down (a mere unmount, e.g. switching
      // tabs, must not kill a running job).
      if (closing.has(tab.id) && tab.kind === 'terminal') void closeEmbeddedTerminalTab(tab.id);
    }
    if (closing.has(shownActiveTabId)) {
      const before = orderedTabs.slice(0, Math.max(0, index)).reverse();
      const after = orderedTabs.slice(index + 1);
      const fallback = [...before, ...after].find((tab) => !closing.has(tab.id));
      setActiveTabId(fallback?.id ?? '');
    }
  };
  const closeTab = (tabId: string) => closeTabs([tabId]);
  const moveTab = (tabId: string, delta: -1 | 1) => {
    const index = orderedTabs.findIndex((tab) => tab.id === tabId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= orderedTabs.length) return;
    const next = [...orderedTabs];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setTabs(next);
  };
  const stepTab = (delta: -1 | 1) => {
    if (orderedTabs.length < 2) return;
    const index = orderedTabs.findIndex((tab) => tab.id === shownActiveTabId);
    const next = orderedTabs[(index + delta + orderedTabs.length) % orderedTabs.length];
    setActiveTabId(next.id);
  };
  return {
    setTabs,
    orderedTabs,
    activeTabId: shownActiveTabId,
    activeTab,
    setActiveTabId,
    pinned,
    setPinnedIds,
    openTab,
    openInstance,
    openSubagentTab,
    replaceTab,
    selectFilesPath,
    selectWorkspaceFilePath,
    closeTabs,
    closeTab,
    moveTab,
    stepTab,
  };
}
