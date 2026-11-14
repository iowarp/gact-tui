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
  PanelsTopLeftIcon,
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
  'mcp-app': PanelsTopLeftIcon,
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
 * name, then the inactive names shortened alike (an ellipsis, not under
 * `TAB_NAME_MIN_PX`), then inactive tabs as icons, the least recently used
 * first, the rest sharing the room their names take, then the least recently
 * used go into a list at the end. Measured, one step at a time, from `full`.
 */
export type TabRowFit = 'full' | 'shorten' | 'compact' | 'overflow';

export function nextTabRowFit(fit: TabRowFit): TabRowFit {
  return fit === 'full' ? 'shorten' : fit === 'shorten' ? 'compact' : 'overflow';
}

/** A named tab's narrowest (FrameTab's `min-w-[6rem]`): shorter, the name says nothing. */
export const TAB_NAME_MIN_PX = 96;

/**
 * The widest every tab in `widths` may be so that together they take no more
 * than `room`: the narrow ones keep their width and the rest share what is left
 * (water-filling). Infinity when all fit as they are; below 0 when none can.
 */
export function sharedTabCap(widths: readonly number[], room: number): number {
  const sorted = [...widths].sort((a, b) => a - b);
  let used = 0;
  for (const [index, width] of sorted.entries()) {
    const cap = (room - used) / (sorted.length - index);
    if (cap <= width) return Math.floor(cap);
    used += width;
  }
  return room >= used ? Infinity : -1;
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

/**
 * Version tags ("v2") for artifact tabs that share their name with another open tab, so
 * two versions of one file (each opened from its comments) read apart.
 */
export function workbenchTabVersions(
  tabs: readonly WorkbenchTab[],
  label: (tab: WorkbenchTab) => string = workbenchTabLabel,
): Map<string, string> {
  const named = new Map<string, number>();
  for (const tab of tabs) named.set(label(tab), (named.get(label(tab)) ?? 0) + 1);
  const versions = new Map<string, string>();
  for (const tab of tabs)
    if (tab.kind === 'artifact' && tab.artifact.version && (named.get(label(tab)) ?? 0) > 1)
      versions.set(tab.id, `v${tab.artifact.version}`);
  return versions;
}

/** Teal: a diff, or a file the conversation changed. */
export function tabChanged(tab: WorkbenchTab, changedPaths: ReadonlySet<string>): boolean {
  if (tab.kind === 'diff') return true;
  const path = workbenchTabPath(tab);
  return path !== undefined && isChangedPath(changedPaths, path);
}
