import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { useConnectionSettings } from '@/providers/connection-provider';
import { browserPageLabel, useBrowserPages } from './use-browser-pages';
import type { WorkbenchTab } from './workbench-shared';

const TABBED_PAGES_KEY = 'clio.workbench.browser-page-tabs.v1';
const TABBED_PAGES_CONVERSATIONS = 100;

type TabbedPages = Record<string, string[]>;

function readTabbedPages(): TabbedPages {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TABBED_PAGES_KEY) ?? 'null') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as TabbedPages) : {};
  } catch {
    return {};
  }
}

function writeTabbedPages(conversation: string, ids: readonly string[]): void {
  const all = readTabbedPages();
  delete all[conversation];
  all[conversation] = [...ids];
  const kept = Object.entries(all).slice(-TABBED_PAGES_CONVERSATIONS);
  try {
    window.localStorage.setItem(TABBED_PAGES_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage full or unavailable: pages still get their tabs, once per load.
  }
}

/**
 * Every open page of the conversation as a workbench tab, kept in sync: a page
 * opened anywhere (the person's own route, a link, the agent, another window)
 * gets a tab behind the shown one, and a page's tab follows its title. A page
 * gets its tab once: a tab the person closed stays closed (the Browser's list,
 * from its right-click, still shows the page).
 */
export function useBrowserPageTabs({
  sessionId,
  workspaceId,
  activeTabId,
  setTabs,
  setActiveTabId,
}: {
  sessionId: string;
  workspaceId: string;
  activeTabId: string;
  setTabs: Dispatch<SetStateAction<WorkbenchTab[]>>;
  setActiveTabId: (tabId: string) => void;
}) {
  const { settings } = useConnectionSettings();
  const pages = useBrowserPages(sessionId);
  const data = pages.data;
  useEffect(() => {
    if (!sessionId || !Array.isArray(data)) return;
    const open = data.filter((page) => !page.closed);
    const conversation = `${settings.endpoint}\n${sessionId}`;
    const tabbed = new Set(readTabbedPages()[conversation] ?? []);
    const fresh = open.filter((page) => !tabbed.has(page.id));
    const labels = new Map(open.map((page) => [`browser:${page.id}`, browserPageLabel(page)]));
    setTabs((current) => {
      let changed = false;
      const next = current.map((tab) => {
        const label = tab.kind === 'browser' ? labels.get(tab.id) : undefined;
        if (!label || label === tab.label) return tab;
        changed = true;
        return { ...tab, label };
      });
      for (const page of fresh) {
        const id = `browser:${page.id}`;
        if (next.some((tab) => tab.id === id)) continue;
        changed = true;
        next.push({
          id,
          kind: 'browser',
          label: browserPageLabel(page),
          pageId: page.id,
          sessionId: page.session_id || sessionId,
          workspaceId,
        });
      }
      return changed ? next : current;
    });
    if (!activeTabId && fresh[0]) setActiveTabId(`browser:${fresh[0].id}`);
    // Only pages the conversation still lists are remembered.
    const listed = new Set(data.map((page) => page.id));
    const remembered = [...tabbed].filter((id) => listed.has(id));
    if (fresh.length || remembered.length !== tabbed.size)
      writeTabbedPages(conversation, [...remembered, ...fresh.map((page) => page.id)]);
    // activeTabId is read, not watched: a tab change must not re-run the sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sessionId, settings.endpoint, setActiveTabId, setTabs, workspaceId]);
}
