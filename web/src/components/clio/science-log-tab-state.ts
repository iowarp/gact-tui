import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { WorkbenchTab } from './workbench-shared';

export const scienceLogTab = {
  id: 'science-log',
  kind: 'science-log',
  label: 'Science log',
} as const satisfies WorkbenchTab;

/**
 * The Science log tab exists only while the session belongs to a study. The
 * study read decides: `true` adds the tab once per session (without taking
 * focus), `false` removes it, and an unknown answer (still loading, or no
 * session yet) hides a restored tab without discarding it.
 */
export function useScienceLogTab(
  inStudy: boolean | undefined,
  sessionId: string,
  tabs: readonly WorkbenchTab[],
  setTabs: Dispatch<SetStateAction<WorkbenchTab[]>>,
  activeTabId: string,
): { tabs: WorkbenchTab[]; activeTabId: string } {
  return useOfferedTab(scienceLogTab, inStudy, sessionId, tabs, setTabs, activeTabId);
}

/**
 * A tab that exists only while `available` says so: `true` adds it once per
 * session (without taking focus), `false` removes it, and unknown hides a
 * restored copy without discarding it.
 */
export function useOfferedTab(
  tab: WorkbenchTab,
  available: boolean | undefined,
  sessionId: string,
  tabs: readonly WorkbenchTab[],
  setTabs: Dispatch<SetStateAction<WorkbenchTab[]>>,
  activeTabId: string,
): { tabs: WorkbenchTab[]; activeTabId: string } {
  const offered = useRef(new Set<string>());
  const { kind } = tab;
  useEffect(() => {
    if (available === true && sessionId && !offered.current.has(sessionId)) {
      offered.current.add(sessionId);
      setTabs((current) =>
        current.some((row) => row.kind === kind) ? current : [...current, tab],
      );
    } else if (available === false) {
      setTabs((current) =>
        current.some((row) => row.kind === kind)
          ? current.filter((row) => row.kind !== kind)
          : current,
      );
    }
    // The tab constant is stable per kind.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [available, kind, sessionId, setTabs]);
  const shown = available === true ? [...tabs] : tabs.filter((row) => row.kind !== kind);
  return {
    tabs: shown,
    activeTabId: shown.some((row) => row.id === activeTabId) ? activeTabId : (shown[0]?.id ?? ''),
  };
}
