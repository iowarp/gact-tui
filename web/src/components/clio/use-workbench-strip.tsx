import type { SubagentRun } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIcon,
  BotIcon,
  BoxIcon,
  FlaskConicalIcon,
  FolderIcon,
  GlobeIcon,
  HistoryIcon,
  PaperclipIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useRepository } from '@/hooks/use-repository';
import { PluginTabIcon } from '@/lib/a2ui/plugin-tab-icons';
import { usePluginPages } from '@/lib/a2ui/plugin-pages';
import { connectionScope } from '@/lib/connection-scope';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { useConnectionSettings } from '@/providers/connection-provider';
import { scienceLogTab } from './science-log-tab-state';
import type { useWorkbenchTabListSlot } from './use-workbench-tab-list-slot';
import { loadResourceViewers, pluginTab, type WorkbenchTab } from './workbench-shared';
import type { WorkbenchListView, WorkbenchStripItem } from './workbench-strip';
import { agentTab, listTab, newBrowserPageTab } from './workbench-tab-storage';
import {
  OPEN_TERMINAL_EVENT,
  useWorkspaceCanvasControl,
  useWorkspaceCanvasVisibility,
} from './workspace-canvas-visibility-context';
import { t } from '@lingui/core/macro';

const RUNNING_STATES = new Set<SubagentRun['state']>(['queued', 'running', 'recovering']);

/**
 * The strip's launchers and their chords: which item is pressed, what a click
 * or its Ctrl+Shift+number does, and Terminal's chord. A list item opens or
 * focuses its tab (on the shown tab, back to the tab before); Terminal and
 * Browser open one more terminal or new page on every press.
 */
export function useWorkbenchStrip({
  activeTabId,
  closeTabOrCanvas,
  inStudy,
  onOpenTerminal,
  openInstance,
  openTab,
  previousTab,
  sessionId,
  setActiveTabId,
  setTabs,
  subagents,
  tabList,
}: {
  activeTabId: string;
  closeTabOrCanvas: (tabId: string) => void;
  inStudy?: boolean;
  onOpenTerminal?: () => void;
  openInstance: (tab: WorkbenchTab) => void;
  openTab: (tab: WorkbenchTab) => void;
  previousTab?: WorkbenchTab;
  sessionId: string;
  setActiveTabId: (tabId: string) => void;
  setTabs: Dispatch<SetStateAction<WorkbenchTab[]>>;
  subagents: readonly SubagentRun[];
  tabList: ReturnType<typeof useWorkbenchTabListSlot>;
}) {
  const canvasVisible = useWorkspaceCanvasVisibility();
  const canvasControl = useWorkspaceCanvasControl();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  // The tabs the conversation's plugins offer. A server without them (or an
  // older one) has none, and the strip shows only its own lists.
  const pluginTabs = useQuery({
    queryKey: ['plugin-tabs', connectionScope(settings), sessionId],
    queryFn: ({ signal }) => repository.pluginTabs(sessionId, signal),
    enabled: Boolean(sessionId),
    retry: false,
    staleTime: 30_000,
  }).data;
  const pluginPages = usePluginPages();
  // An open plugin tab follows the list: a plugin updated in place may rename
  // its tab, its plugin or its icon.
  useEffect(() => {
    if (!pluginTabs) return;
    const offeredById = new Map(pluginTabs.map((offered) => [offered.id, offered]));
    setTabs((current) => {
      let changed = false;
      const next = current.map((tab) => {
        if (tab.kind !== 'plugin' || tab.sessionId !== sessionId) return tab;
        const offered = offeredById.get(tab.tabId);
        if (!offered) return tab;
        const pluginTitle = offered.plugin_title || undefined;
        if (
          tab.label === offered.title &&
          (tab.pluginTitle || undefined) === pluginTitle &&
          tab.icon === offered.icon &&
          tab.plugin === offered.plugin
        )
          return tab;
        changed = true;
        return {
          ...tab,
          label: offered.title,
          pluginTitle,
          icon: offered.icon,
          plugin: offered.plugin,
        };
      });
      return changed ? next : current;
    });
  }, [pluginTabs, sessionId, setTabs]);

  const runningSubagents = subagents.filter((run) => RUNNING_STATES.has(run.state)).length;
  const listIsPressed = (id: WorkbenchListView) => {
    if (activeTabId === listTab(id).id) return true;
    // Terminal and Browser light for any of their own tabs.
    if (id === 'terminal') return activeTabId.startsWith('terminal:');
    if (id === 'browser')
      return activeTabId.startsWith(newBrowserPageTab.id) || activeTabId.startsWith('browser:');
    return false;
  };
  const stripItems: WorkbenchStripItem[] = [];
  const listItem = (id: WorkbenchListView, label: string, icon: ReactNode, count?: number) =>
    stripItems.push({
      id,
      label,
      icon,
      position: stripItems.filter((item) => item.position).length + 1,
      pressed: listIsPressed(id),
      count,
    });
  listItem('files', t`Files`, <FolderIcon />);
  listItem('sources', t`Sources`, <PaperclipIcon />);
  listItem('artifacts', t`Artifacts`, <BoxIcon />);
  listItem('activity', t`Activity`, <ActivityIcon />, runningSubagents);
  // Beside Activity: every task the system ran. No position of its own, so Agent,
  // Terminal and Browser keep their keys.
  stripItems.push({
    id: 'runs',
    label: t`Runs`,
    icon: <HistoryIcon />,
    pressed: listIsPressed('runs'),
  });
  stripItems.push({
    id: 'agent',
    label: t`Agent`,
    icon: <BotIcon />,
    position: 5,
    pressed: activeTabId === agentTab.id,
  });
  if (inStudy === true)
    stripItems.push({
      id: 'science-log',
      label: t`Science log`,
      icon: <FlaskConicalIcon />,
      pressed: activeTabId === scienceLogTab.id,
    });
  // Always on the strip: where terminals can't run, its list says so.
  listItem('terminal', t`Terminal`, <TerminalSquareIcon />);
  listItem('browser', t`Browser`, <GlobeIcon />);
  const pluginTabFor = new Map<string, WorkbenchTab>();
  // A plugin's page in the left bar already opens this resource; no strip launcher repeats it.
  const onPages = new Set(pluginPages.map((page) => `${page.plugin}\u0000${page.resource}`));
  for (const offered of pluginTabs ?? []) {
    if (onPages.has(`${offered.plugin}\u0000${offered.resource}`)) continue;
    const tab = pluginTab({
      label: offered.title,
      sessionId,
      tabId: offered.id,
      plugin: offered.plugin,
      pluginTitle: offered.plugin_title,
      icon: offered.icon,
    });
    const id = `plugin:${offered.id}` as const;
    pluginTabFor.set(id, tab);
    const title = offered.title;
    stripItems.push({
      id,
      label: offered.available ? title : t`${title} (unavailable)`,
      icon: <PluginTabIcon name={offered.icon} />,
      pressed: activeTabId === tab.id,
    });
  }

  /** A launcher click: open or focus the tab; on the shown tab, go back to the one before. */
  const toggleTab = (tab: WorkbenchTab) => {
    if (activeTabId !== tab.id) {
      if (tab.kind === 'list' && tab.view === 'artifacts') void loadResourceViewers();
      openTab(tab);
    } else if (previousTab) setActiveTabId(previousTab.id);
    else closeTabOrCanvas(tab.id);
  };
  // Where no terminal can run, Terminal lands on its list, which says so.
  const openTerminal = () => {
    if (!canvasVisible) canvasControl?.show();
    if (onOpenTerminal) void onOpenTerminal();
    else openTab(listTab('terminal'));
  };

  const selectStripItem = (id: WorkbenchStripItem['id']) => {
    if (id === 'terminal') {
      openTerminal();
      return;
    }
    if (id === 'browser') {
      if (!canvasVisible) canvasControl?.show();
      openInstance(newBrowserPageTab);
      return;
    }
    if (id === 'agent') {
      toggleTab(agentTab);
      return;
    }
    if (id === 'science-log') {
      // The open log's strip item shows or hides its study tree; otherwise it opens the log.
      if (activeTabId === scienceLogTab.id && tabList.slot.title) {
        tabList.setShown(!tabList.slot.shown);
        return;
      }
      openTab(scienceLogTab);
      return;
    }
    if (id.startsWith('plugin:')) {
      const tab = pluginTabFor.get(id);
      if (tab) toggleTab(tab);
      return;
    }
    toggleTab(listTab(id as WorkbenchListView));
  };

  useShortcut('strip-position', (_event, position) => {
    const item = stripItems.find((candidate) => candidate.position === position);
    if (!item) return;
    if (canvasVisible) {
      selectStripItem(item.id);
      return;
    }
    // Closed: open the pocket at this item rather than toggling it off.
    canvasControl?.show();
    if (!item.pressed) selectStripItem(item.id);
  });
  // A chord pressed while the pocket was unmounted (closed Sheet) lands here.
  const takePendingStripPosition = (position: number | 'terminal') => {
    canvasControl?.clearPendingStripPosition();
    const item = stripItems.find((candidate) =>
      position === 'terminal' ? candidate.id === 'terminal' : candidate.position === position,
    );
    // Opening the pocket is the whole of the chord when its item is already shown.
    if (item && !item.pressed) selectStripItem(item.id);
  };
  useShortcut('terminal', openTerminal);
  useShortcut('new-terminal', openTerminal, { enabled: Boolean(onOpenTerminal) });
  const onOpenTerminalEvent = useEffectEvent(openTerminal);
  useEffect(() => {
    const open = () => onOpenTerminalEvent();
    window.addEventListener(OPEN_TERMINAL_EVENT, open);
    return () => window.removeEventListener(OPEN_TERMINAL_EVENT, open);
  }, []);

  return {
    stripItems,
    selectStripItem,
    takePendingStripPosition,
    pendingStripPosition: canvasControl?.pendingStripPosition,
  };
}
