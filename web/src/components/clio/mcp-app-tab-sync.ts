import { useEffect, useRef } from 'react';
import { mcpAppTabLeft, useMcpAppLiveSetStore } from './mcp-app-live-set';
import type { WorkbenchTab } from './workbench-shared';

/**
 * Close an App's tab when its frame leaves it: the view asked for `inline`,
 * Return to conversation, or the host closed the App (MA2, MA7).
 */
export function useMcpAppTabSync(
  tabs: readonly WorkbenchTab[],
  closeTabs: (ids: readonly string[]) => void,
): void {
  const latest = useRef({ tabs, closeTabs });
  useEffect(() => {
    latest.current = { tabs, closeTabs };
  });
  useEffect(() => {
    const sync = () => {
      const leaving = latest.current.tabs
        .filter((tab) => tab.kind === 'mcp-app' && mcpAppTabLeft(tab.appInstanceId))
        .map((tab) => tab.id);
      if (leaving.length) latest.current.closeTabs(leaving);
    };
    sync();
    return useMcpAppLiveSetStore.subscribe(sync);
  }, []);
}
