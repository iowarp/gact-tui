import { useEffect, useRef } from 'react';
import { mcpAppTabLeft, useMcpAppLiveSetStore } from './mcp-app-live-set';
import { SPLIT_WORKBENCH_QUERY, type WorkbenchTab } from './workbench-shared';

/**
 * Close an App's tab when its frame leaves it: the view asked for `inline`,
 * Return to conversation, or the host closed the App (MA2, MA7).
 */
export function useMcpAppTabSync(
  tabs: readonly WorkbenchTab[],
  closeTabs: (ids: readonly string[]) => void,
  hideCanvas?: () => void,
): void {
  const latest = useRef({ tabs, closeTabs, hideCanvas });
  useEffect(() => {
    latest.current = { tabs, closeTabs, hideCanvas };
  });
  useEffect(() => {
    const sync = () => {
      const leaving = latest.current.tabs
        .filter((tab) => tab.kind === 'mcp-app' && mcpAppTabLeft(tab.appInstanceId))
        .map((tab) => tab.id);
      if (!leaving.length) return;
      latest.current.closeTabs(leaving);
      // Under the split width the canvas covers the conversation: the card the
      // App went back to is only visible once the canvas slides away.
      if (!window.matchMedia?.(SPLIT_WORKBENCH_QUERY).matches) latest.current.hideCanvas?.();
    };
    sync();
    return useMcpAppLiveSetStore.subscribe(sync);
  }, []);
}
