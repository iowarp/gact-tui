import {
  ActivityIcon,
  BookIcon,
  BotIcon,
  BoxIcon,
  DatabaseIcon,
  FileCode2Icon,
  FileDiffIcon,
  FlaskConicalIcon,
  FolderIcon,
  GlobeIcon,
  ListChecksIcon,
  ListIcon,
  PaperclipIcon,
  SearchIcon,
  TerminalSquareIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { artifactDisplayName } from '@/lib/dashboard-presentation';
import { isChangedPath, type WorkbenchTab } from './workbench-shared';
import type { WorkbenchTabListView } from './workbench-strip';

export const workbenchTabIcons = {
  knowledge: BookIcon,
  ndp: DatabaseIcon,
  work: ListChecksIcon,
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
  list: ListIcon,
  search: SearchIcon,
  'variant-try': BotIcon,
} satisfies Record<
  WorkbenchTab['kind'],
  ComponentType<{ 'aria-hidden'?: boolean; className?: string }>
>;

/** A list tab wears its strip icon, so the tab and the icon that opened it match. */
export const workbenchListTabIcons = {
  files: FolderIcon,
  sources: PaperclipIcon,
  artifacts: BoxIcon,
  activity: ActivityIcon,
  terminal: TerminalSquareIcon,
  browser: GlobeIcon,
} satisfies Record<WorkbenchTabListView, ComponentType>;

/** The workspace path a tab shows, when it shows one (Show in Files, Copy path). */
export function workbenchTabPath(tab: WorkbenchTab): string | undefined {
  if (tab.kind === 'workspace-file') return tab.path;
  if (tab.kind === 'diff') return tab.diff.path;
  return undefined;
}

/**
 * How the tab row fits (workbench-lineage "The tab row, as it narrows"): every
 * name, then inactive tabs as icons, the least recently used first and one at
 * a time, then the least recently used go into a list at the end. Measured,
 * one step at a time, from `full`.
 */
export type TabRowFit = 'full' | 'compact' | 'overflow';

export function nextTabRowFit(fit: TabRowFit): TabRowFit {
  return fit === 'full' ? 'compact' : 'overflow';
}

/**
 * The tabs in the list at the end of the row: all but the open tab and the
 * `shown` most recently used, most recent first. `recency` holds tab ids, most
 * recently opened in front first; a tab never in front ranks by when it opened.
 */
export function overflowTabs(
  tabs: readonly WorkbenchTab[],
  activeTabId: string,
  recency: readonly string[],
  shown: number,
): WorkbenchTab[] {
  return tabs
    .map((tab, index) => {
      const used = recency.indexOf(tab.id);
      return { tab, rank: used >= 0 ? used : recency.length + tabs.length - index };
    })
    .filter(({ tab }) => tab.id !== activeTabId)
    .sort((a, b) => a.rank - b.rank)
    .slice(Math.max(0, shown))
    .map(({ tab }) => tab);
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
