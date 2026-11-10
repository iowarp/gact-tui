import type { SubagentRun } from '@clio/core/v3';
import {
  ActivityIcon,
  BotIcon,
  BoxIcon,
  FlaskConicalIcon,
  FolderIcon,
  GlobeIcon,
  PaperclipIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { scienceLogTab } from './science-log-tab-state';
import type { useWorkbenchTabListSlot } from './use-workbench-tab-list-slot';
import { loadResourceViewers, type WorkbenchTab } from './workbench-shared';
import type { WorkbenchListView, WorkbenchStripItem } from './workbench-strip';
import { agentTab, listTab } from './workbench-tab-storage';
import {
  OPEN_TERMINAL_EVENT,
  useWorkspaceCanvasControl,
  useWorkspaceCanvasVisibility,
} from './workspace-canvas-visibility-context';

const RUNNING_STATES = new Set<SubagentRun['state']>(['queued', 'running', 'recovering']);

/**
 * The strip's launchers and their chords: which item is pressed, what a click
 * or its Ctrl+Shift+number does (open, or back to the tab before), and Terminal's chord.
 */
export function useWorkbenchStrip({
  activeTabId,
  closeTabOrCanvas,
  inStudy,
  onOpenTerminal,
  openTab,
  previousTab,
  setActiveTabId,
  subagents,
  tabList,
}: {
  activeTabId: string;
  closeTabOrCanvas: (tabId: string) => void;
  inStudy?: boolean;
  onOpenTerminal?: () => void;
  openTab: (tab: WorkbenchTab) => void;
  previousTab?: WorkbenchTab;
  setActiveTabId: (tabId: string) => void;
  subagents: readonly SubagentRun[];
  tabList: ReturnType<typeof useWorkbenchTabListSlot>;
}) {
  const canvasVisible = useWorkspaceCanvasVisibility();
  const canvasControl = useWorkspaceCanvasControl();

  const runningSubagents = subagents.filter((run) => RUNNING_STATES.has(run.state)).length;
  const listIsPressed = (id: WorkbenchListView) => activeTabId === listTab(id).id;
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
  listItem('files', 'Files', <FolderIcon />);
  listItem('sources', 'Sources', <PaperclipIcon />);
  listItem('artifacts', 'Artifacts', <BoxIcon />);
  listItem('activity', 'Activity', <ActivityIcon />, runningSubagents);
  stripItems.push({
    id: 'agent',
    label: 'Agent',
    icon: <BotIcon />,
    position: 5,
    pressed: activeTabId === agentTab.id,
  });
  if (inStudy === true)
    stripItems.push({
      id: 'science-log',
      label: 'Science log',
      icon: <FlaskConicalIcon />,
      pressed: activeTabId === scienceLogTab.id,
    });
  // Always on the strip: where terminals can't run, its list says so.
  listItem('terminal', 'Terminal', <TerminalSquareIcon />);
  listItem('browser', 'Browser pages', <GlobeIcon />);

  /** A launcher click: open or focus the tab; on the shown tab, go back to the one before. */
  const toggleTab = (tab: WorkbenchTab) => {
    if (activeTabId !== tab.id) {
      if (tab.kind === 'list' && tab.view === 'artifacts') void loadResourceViewers();
      openTab(tab);
    } else if (previousTab) setActiveTabId(previousTab.id);
    else closeTabOrCanvas(tab.id);
  };

  const selectStripItem = (id: WorkbenchStripItem['id']) => {
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
    toggleTab(listTab(id));
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
    if (item) selectStripItem(item.id);
  };
  // Where no terminal can run, the chord still lands on Terminal's list, which says so.
  const openTerminal = () => {
    if (!canvasVisible) canvasControl?.show();
    if (onOpenTerminal) void onOpenTerminal();
    else openTab(listTab('terminal'));
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
