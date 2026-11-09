import {
  ActivityIcon,
  BotIcon,
  BoxesIcon,
  BoxIcon,
  ChartNoAxesGanttIcon,
  FileCode2Icon,
  FileDiffIcon,
  FlaskConicalIcon,
  FolderIcon,
  GlobeIcon,
  ListChecksIcon,
  PaperclipIcon,
  TerminalSquareIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { artifactDisplayName } from '@/lib/dashboard-presentation';
import { isChangedPath, type WorkbenchTab } from './workbench-shared';

export const workbenchTabIcons = {
  knowledge: BoxesIcon,
  work: ListChecksIcon,
  session: ChartNoAxesGanttIcon,
  activity: ActivityIcon,
  files: FolderIcon,
  artifacts: BoxIcon,
  agent: BotIcon,
  resources: PaperclipIcon,
  'science-log': FlaskConicalIcon,
  'workspace-file': FileCode2Icon,
  diff: FileDiffIcon,
  artifact: BoxIcon,
  resource: PaperclipIcon,
  subagent: BotIcon,
  flow: WorkflowIcon,
  terminal: TerminalSquareIcon,
  browser: GlobeIcon,
} satisfies Record<
  WorkbenchTab['kind'],
  ComponentType<{ 'aria-hidden'?: boolean; className?: string }>
>;

/** The workspace path a tab shows, when it shows one (Show in Files, Copy path). */
export function workbenchTabPath(tab: WorkbenchTab): string | undefined {
  if (tab.kind === 'workspace-file') return tab.path;
  if (tab.kind === 'diff') return tab.diff.path;
  return undefined;
}

/**
 * How the tab row fits: every name, then inactive tabs as icons, then also an
 * "All N tabs" menu. Measured, one step at a time, from `full`.
 */
export type TabRowFit = 'full' | 'compact' | 'overflow';

export function nextTabRowFit(fit: TabRowFit): TabRowFit {
  return fit === 'full' ? 'compact' : 'overflow';
}

export function workbenchTabLabel(tab: WorkbenchTab): string {
  return tab.kind === 'artifact' ? artifactDisplayName(tab.artifact) : tab.label;
}

/** Teal: a diff, or a file the conversation changed. */
export function tabChanged(tab: WorkbenchTab, changedPaths: ReadonlySet<string>): boolean {
  if (tab.kind === 'diff') return true;
  const path = workbenchTabPath(tab);
  return path !== undefined && isChangedPath(changedPaths, path);
}
