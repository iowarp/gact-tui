import { memo, type ReactNode } from 'react';
import { IconButton } from './primitives/icon-button';
import { tourAnchor } from '@/lib/onboarding/tour-anchors';

export type WorkbenchListView =
  | 'files'
  | 'sources'
  | 'artifacts'
  | 'activity'
  | 'terminal'
  | 'browser';

/** Every strip list, Files included, opens as a workbench tab. */
export type WorkbenchTabListView = WorkbenchListView;

export interface WorkbenchStripItem {
  id: WorkbenchListView | 'agent' | 'science-log';
  label: string;
  icon: ReactNode;
  /** 1-based place on the strip; Ctrl+Shift+N (⌥⌘N on a Mac) reaches it. */
  position?: number;
  /** Lit: the item's tab is the one in view. */
  pressed: boolean;
  /** A small count on the corner (child agents running). */
  count?: number;
}

/**
 * The workbench's outer edge, a launcher: each icon opens or focuses its list
 * as a tab, then Terminal and Browser pages. It sits on the window edge so it
 * never moves when the panel is resized. Clicking the lit icon goes back to
 * the tab before.
 */
export const WorkbenchStrip = memo(function WorkbenchStrip({
  items,
  onSelect,
  trailing,
}: {
  items: readonly WorkbenchStripItem[];
  onSelect: (id: WorkbenchStripItem['id']) => void;
  /** Controls pinned to the strip's foot (none yet; the gear is a follow-up). */
  trailing?: ReactNode;
}) {
  const lists = items.filter((item) => item.id !== 'terminal' && item.id !== 'browser');
  const tools = items.filter((item) => item.id === 'terminal' || item.id === 'browser');
  const button = (item: WorkbenchStripItem) => (
    <IconButton
      key={item.id}
      aria-pressed={item.pressed}
      count={item.count}
      data-strip-item={item.id}
      icon={item.icon}
      label={item.label}
      onClick={() => onSelect(item.id)}
      // Terminal shows its own key (Ctrl+`), as the keyboard map draws it; its position still works.
      shortcut={item.id === 'terminal' ? 'terminal' : item.position ? 'strip-position' : undefined}
      shortcutPosition={item.id === 'terminal' ? undefined : item.position}
      // Under its icon, inside the rail: left of the rail is pocket content (tree labels).
      shortcutSide="under-icon"
      tooltipSide="left"
      // The lit cell carries the spec's 2px primary bar on the window edge, no fill.
      className="h-9 w-11 rounded-none hover:bg-transparent aria-pressed:bg-transparent aria-pressed:after:absolute aria-pressed:after:inset-y-2 aria-pressed:after:right-0 aria-pressed:after:w-0.5 aria-pressed:after:rounded-full aria-pressed:after:bg-primary"
    />
  );
  return (
    <div
      role="toolbar"
      aria-label="Workbench lists"
      aria-orientation="vertical"
      data-slot="workbench-strip"
      {...tourAnchor('workbench-lists')}
      className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-l border-border bg-sidebar pt-1.5 pb-2"
    >
      {lists.map(button)}
      {tools.length ? (
        <span aria-hidden="true" className="my-[5px] h-px w-5 shrink-0 bg-border" />
      ) : null}
      {tools.map(button)}
      {trailing ? <div className="mt-auto flex flex-col items-center gap-1">{trailing}</div> : null}
    </div>
  );
});
