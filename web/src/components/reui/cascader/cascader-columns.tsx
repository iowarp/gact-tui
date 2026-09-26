'use client';

import * as React from 'react';
import { useCascaderActions, useCascaderState } from '@/components/reui/cascader/cascader-context';
import type { CascaderColumn } from '@/components/reui/cascader/cascader-context';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { CascaderItem, getCascaderMoreProps } from '@/components/reui/cascader/cascader-item';
import {
  CASCADER_LIST_HEIGHT_CLASS,
  CASCADER_LIST_PAD_CLASS,
  CASCADER_ROOT_KEY,
  CASCADER_ROWS_CLASS,
  CASCADER_SCROLL_CLASS,
  warnCascaderOnce,
} from '@/components/reui/cascader/cascader-lib';
import { Combobox as ComboboxPrimitive } from '@base-ui/react';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoaderCircleIcon } from 'lucide-react';

export interface CascaderColumnsProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** Width of each column. */
  columnWidth?: number | string;
  /** Height CAP per column. Falls back to the root `maxHeight`, then 24rem. */
  maxHeight?: number | string;
  /** Replaces the default panel; the seam a windowed column plugs into. */
  children?: (column: CascaderColumn) => React.ReactNode;
}

/**
 * Miller columns: the open trail side by side, one panel per level. Only the
 * DEEPEST column is a real listbox (Base UI owns exactly one list); the trail
 * behind is plain buttons, which keeps one state machine instead of a second,
 * 2D one. `CascaderInput` moves between columns with ArrowLeft/ArrowRight.
 */
function CascaderColumns({
  className,
  columnWidth = 220,
  maxHeight: maxHeightProp,
  children,
  ...props
}: CascaderColumnsProps) {
  const { maxHeight, mode, labels } = useCascaderActions();
  const { columns } = useCascaderState();

  // Before the early return, so the hook count is the same in both modes.
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (mode === 'columns') return;
    warnCascaderOnce(
      `columns-outside-columns-mode:${mode}`,
      `\`CascaderColumns\` renders nothing in \`mode="${mode}"\`, so \`columnWidth\` and everything else on it does nothing. Set \`mode="columns"\` on the root, or render \`CascaderList\` instead.`,
    );
  }, [mode]);

  if (mode !== 'columns') return null;

  const height = maxHeightProp ?? maxHeight;
  const toCss = (value: number | string) => (typeof value === 'number' ? `${value}px` : value);

  return (
    <div
      data-slot="cascader-columns"
      role="group"
      aria-label={labels.columnsLabel}
      style={
        {
          '--cascader-column-width': toCss(columnWidth),
          /* Set only from an EXPLICIT cap: unset means "24rem or what the
             viewport leaves", via the `min()` fallback on the panel. A `?? 280`
             default here ignored short viewports and wasted tall ones. */
          ...(height != null ? { '--cascader-max-height': toCss(height) } : null),
        } as React.CSSProperties
      }
      className={cn(
        /* `max-h-full` with `min-h-0`: the trail is the panel's shrinking
           child, and the columns inside it size against this box. */
        'flex max-h-full min-h-0 items-stretch overflow-x-auto overscroll-x-contain',
        CASCADER_LIST_PAD_CLASS,
        className,
      )}
      {...props}
    >
      {columns.map((column) =>
        children ? (
          <React.Fragment key={column.depth}>{children(column)}</React.Fragment>
        ) : (
          <CascaderColumnPanel key={column.depth} column={column} />
        ),
      )}
    </div>
  );
}

/**
 * One column's box. `columnWidth` is the width of the LIST, not the box: under
 * `border-box` the 1px inline-start divider on every column but the first would
 * come out of the rows, so bordered columns are widened by that pixel. The box
 * is also the BOUND, the same `min(--available-height, cap)` the single list
 * uses, and the `ScrollArea` inside scrolls, so every column shows a thumb.
 */
const PANEL_CLASS = `flex w-(--cascader-column-width) shrink-0 flex-col overscroll-contain not-first:w-[calc(var(--cascader-column-width)_+_1px)] not-first:border-border/60 not-first:border-s ${CASCADER_LIST_HEIGHT_CLASS}`;

export interface CascaderColumnPanelProps {
  column: CascaderColumn;
  /** Replaces the panel's rows; the empty state still wins on an empty column. */
  children?: React.ReactNode;
  /** Containing block for the windowed column's absolutely positioned rows. */
  virtualized?: boolean;
  /**
   * Extra content stacked below this column's own rows, INSIDE its bounded
   * box (never a separate full-width row below every column -- that leaves a
   * matching empty cell under every column that doesn't have one). The rows'
   * `ScrollArea` shrinks to make room instead of filling the whole box.
   */
  footer?: React.ReactNode;
  /**
   * Splits the active column into labelled groups that scroll on their own
   * (e.g. one provider reachable two ways). The column's rows are the
   * concatenation of every section's `items`, in order; each section renders
   * as a named `group` of options inside the ONE listbox, so arrow keys still
   * walk every row. Non-row content (sign-in buttons, fields) never goes
   * here: it belongs in `footer` or `empty`, outside the listbox.
   */
  sections?: readonly CascaderColumnSection[];
  /**
   * Replaces the default "No results" text when the column has no rows, and
   * renders OUTSIDE the listbox so it may hold real controls.
   */
  empty?: React.ReactNode;
}

/** One labelled, independently scrolling group of a split column. */
export interface CascaderColumnSection {
  key: string;
  /** The group's visible heading (plain content: no focusable controls). */
  label: React.ReactNode;
  /** The group's accessible name. */
  ariaLabel: string;
  items: readonly CascaderNode[];
  /** Rendered between the previous section and this one (e.g. an "or" rule). */
  separator?: React.ReactNode;
}

function CascaderColumnPanel({
  column,
  children,
  virtualized,
  footer,
  sections,
  empty,
}: CascaderColumnPanelProps) {
  const { labels, baseId, isBranch, isSelectable, isSelected, isIndeterminate, retryLevel } =
    useCascaderActions();
  const { loadStates } = useCascaderState();

  // Keyed per level, not one global flag: columns load and land independently.
  const columnKey = column.parent?.value ?? CASCADER_ROOT_KEY;
  const loadState = loadStates.get(columnKey);

  let emptyBody: React.ReactNode = labels.empty;
  if (loadState?.error) {
    emptyBody = (
      <>
        {labels.error}{' '}
        <button
          type="button"
          data-slot="cascader-retry"
          onClick={() => retryLevel(columnKey)}
          className="text-foreground hover:bg-accent focus-visible:ring-ring/50 rounded-md px-1 font-medium outline-hidden transition-colors focus-visible:ring-2"
        >
          {labels.retry}
        </button>
      </>
    );
  } else if (loadState?.loading) {
    emptyBody = (
      <span className="flex items-center gap-1.5">
        <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
        {labels.loading}
      </span>
    );
  }

  const renderRow = (node: CascaderNode, i: number) => {
    const open = node.value === column.activeValue;
    return (
      <CascaderItem
        key={node.value}
        node={node}
        /* A trail row must not compete for `aria-activedescendant`. */
        as={column.active ? 'option' : 'button'}
        depth={column.depth}
        /* Answered here, not in the row: the trail rows are memoised too. */
        branch={isBranch(node)}
        selectable={isSelectable(node)}
        selected={isSelected(node)}
        indeterminate={isIndeterminate(node)}
        {...getCascaderMoreProps(node, loadStates)}
        data-open={open || undefined}
        className={open ? 'bg-accent/60 text-accent-foreground' : undefined}
        /* Set metadata is option-only; a trail row is a `role="button"`. The
           explicit index keeps a split column's rows in one sequence; the
           row itself only forwards it while the root is windowed. */
        {...(column.active
          ? {
              index: i,
              'aria-setsize': column.items.length,
              'aria-posinset': i + 1,
            }
          : null)}
        {...(!column.active && open
          ? {
              'aria-expanded': true,
              'aria-controls': `${baseId}-column-${column.depth + 1}`,
            }
          : null)}
      />
    );
  };

  const rows =
    column.items.length === 0 && empty !== undefined ? null : column.items.length === 0 ? (
      <p
        data-slot="cascader-column-empty"
        data-state={loadState?.error ? 'error' : loadState?.loading ? 'loading' : 'empty'}
        className="text-muted-foreground px-2 py-1.5 text-sm"
      >
        {emptyBody}
      </p>
    ) : (
      (children ?? column.items.map(renderRow))
    );

  const shared = {
    'data-slot': 'cascader-column',
    'data-active': column.active || undefined,
    'data-depth': column.depth,
    // Addressable so the opening trail row can point `aria-controls` here, and
    // named even at the root, which has no parent label to borrow.
    id: `${baseId}-column-${column.depth}`,
    'aria-label': column.parent?.label ?? labels.rootLevel,
    // Conditional spread, never an explicit `undefined`: the active column is a
    // Base UI element, and its `mergeProps` iterates own keys.
    ...(virtualized ? { 'data-virtualized': true } : null),
  };

  // A windowed row is absolutely positioned, so the ROWS' box is the containing
  // block, not the scrollport: it carries the padding the geometry is measured
  // against.
  const rowsClass = cn(CASCADER_ROWS_CLASS, virtualized && 'relative');

  // The active column IS the Combobox list: only rows inside `Combobox.List`
  // reach the CompositeList, arrow-key navigation and `aria-activedescendant`.
  const body = column.active ? (
    <ComboboxPrimitive.List {...shared} className={rowsClass}>
      {rows}
    </ComboboxPrimitive.List>
  ) : (
    // A named `group`, not a second listbox competing with the active column.
    <div {...shared} role="group" className={rowsClass}>
      {rows}
    </div>
  );

  if (sections) {
    let offset = 0;
    const groups = sections.map((section) => {
      const start = offset;
      offset += section.items.length;
      return { section, start };
    });
    const groupNodes = groups.map(({ section, start }) => (
      <React.Fragment key={section.key}>
        {section.separator}
        <div
          aria-label={section.ariaLabel}
          className="flex min-h-0 flex-1 basis-0 flex-col"
          data-section={section.key}
          data-slot="cascader-column-section"
          role="group"
        >
          <div className="shrink-0" role="presentation">
            {section.label}
          </div>
          <div className="min-h-0 w-full flex-1">
            <ScrollArea className={CASCADER_SCROLL_CLASS}>
              <div className={CASCADER_ROWS_CLASS}>
                {section.items.map((node, i) => renderRow(node, start + i))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </React.Fragment>
    ));
    const splitClass = 'flex min-h-0 w-full flex-1 flex-col';
    return (
      <div
        data-slot="cascader-column-bounds"
        data-active={column.active || undefined}
        data-depth={column.depth}
        data-split=""
        className={PANEL_CLASS}
      >
        {column.active ? (
          <ComboboxPrimitive.List {...shared} className={splitClass}>
            {groupNodes}
          </ComboboxPrimitive.List>
        ) : (
          <div {...shared} role="group" className={splitClass}>
            {groupNodes}
          </div>
        )}
        {footer}
      </div>
    );
  }

  return (
    <div
      data-slot="cascader-column-bounds"
      /* Repeated from `shared`: this box, not the semantic element, owns the
         width, the divider and the height, so style hooks must reach it, and
         `:first-child` on the semantic element no longer means "first column"
         (it is its own scrollport's only child). */
      data-active={column.active || undefined}
      data-depth={column.depth}
      className={PANEL_CLASS}
    >
      {rows === null ? (
        <>
          {/* The listbox stays mounted (Base UI owns exactly one); the
              caller's empty content sits beside it, free to hold controls. */}
          {body}
          <div
            className="flex min-h-0 w-full flex-1 flex-col"
            data-slot="cascader-column-empty-content"
          >
            {empty}
          </div>
        </>
      ) : footer ? (
        <div className="min-h-0 w-full flex-1">
          <ScrollArea className={CASCADER_SCROLL_CLASS}>{body}</ScrollArea>
        </div>
      ) : (
        <ScrollArea className={CASCADER_SCROLL_CLASS}>{body}</ScrollArea>
      )}
      {footer}
    </div>
  );
}

export interface CascaderSectionedItemsProps {
  /** Splits the current level's rows into labelled groups (same shape as a split column). */
  sections: (items: readonly CascaderNode[]) => readonly CascaderColumnSection[];
}

/**
 * The drill-mode counterpart of a split column: dropped inside `CascaderList`
 * in place of `CascaderItems`, it renders the current level's rows as the same
 * labelled groups, in one scroll (a narrow panel has no room for two).
 */
function CascaderSectionedItems({ sections }: CascaderSectionedItemsProps) {
  const { isBranch, isSelectable, isSelected, isIndeterminate } = useCascaderActions();
  const { renderedItems, loadStates } = useCascaderState();
  let offset = 0;
  return (
    <>
      {sections(renderedItems).map((section) => {
        const start = offset;
        offset += section.items.length;
        return (
          <React.Fragment key={section.key}>
            {section.separator}
            <div
              aria-label={section.ariaLabel}
              data-section={section.key}
              data-slot="cascader-column-section"
              role="group"
            >
              <div role="presentation">{section.label}</div>
              {section.items.map((node, i) => (
                <CascaderItem
                  key={node.value}
                  node={node}
                  index={start + i}
                  branch={isBranch(node)}
                  selectable={isSelectable(node)}
                  selected={isSelected(node)}
                  indeterminate={isIndeterminate(node)}
                  {...getCascaderMoreProps(node, loadStates)}
                  aria-setsize={renderedItems.length}
                  aria-posinset={start + i + 1}
                />
              ))}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
}

export { CascaderColumnPanel, CascaderColumns, CascaderSectionedItems };
