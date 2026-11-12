import type { ToolSetting } from '@clio/core/v3';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TooltipProvider } from '@/components/ui/tooltip';
import { scrollParent } from '@/hooks/use-seen-in-view';
import type { ToolEditor } from './settings-tools-editor';
import { toolsFold, type ToolsFold } from './settings-tools-columns';
import { HeaderRow } from './settings-tools-header';
import { GroupRow } from './settings-tools-group-row';
import type { RowEditor } from './settings-tools-options';
import type { ToolTableSection } from './settings-tools-section';
import { ToolRow } from './settings-tools-tool-row';

export type { ToolTableSection } from './settings-tools-section';

/** Above this many rows the table renders only those near the visible part of its scroller. */
const WINDOW_FROM = 80;
const GROUP_HEIGHT = 46;
const ROW_HEIGHT = 44;

type TableItem =
  | { kind: 'group'; section: number; key: string }
  | { kind: 'tool'; section: number; key: string; tool: ToolSetting; position: number }
  | { kind: 'reserve'; section: number; key: string };

/** The table's rows in order: each group, then its tools or the space they will take. */
function tableItems(
  sections: readonly ToolTableSection[],
  collapsed: ReadonlySet<string>,
): TableItem[] {
  return sections.flatMap((section, index): TableItem[] => {
    const group: TableItem = { kind: 'group', section: index, key: `g:${section.id}` };
    if (collapsed.has(section.id)) return [group];
    if (section.tools.length)
      return [
        group,
        ...section.tools.map(
          (tool, place): TableItem => ({
            kind: 'tool',
            section: index,
            key: `t:${section.id}:${tool.name}`,
            tool,
            position: place + 1,
          }),
        ),
      ];
    return [
      group,
      ...Array.from(
        { length: section.reserveRows ?? 0 },
        (_, slot): TableItem => ({
          kind: 'reserve',
          section: index,
          key: `r:${section.id}:${slot}`,
        }),
      ),
    ];
  });
}

/**
 * Permission and I/O per tool, in groups: one row per tool with its flag, what
 * a call does in the chosen approval mode, and its two choices. Folds by its
 * own width, so the same table serves Settings and a plugin's detail pane.
 * A long table keeps only the rows near view in the page, so hundreds of tools
 * cost what a screenful does.
 */
export function ToolSettingsTable({
  sections,
  mode,
  editor,
  label,
}: {
  sections: readonly ToolTableSection[];
  mode: string;
  editor: ToolEditor;
  label: string;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (id: string) =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const { save, removeRule } = editor;
  const rowEditor = useMemo<RowEditor>(() => ({ save, removeRule }), [save, removeRule]);
  const items = useMemo(() => tableItems(sections, collapsed), [sections, collapsed]);
  const windowed = items.length > WINDOW_FROM;
  const list = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const [fold, setFold] = useState<ToolsFold>();
  useLayoutEffect(() => {
    const element = table.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measureFold = (width: number) =>
      setFold(
        toolsFold(width, parseFloat(getComputedStyle(document.documentElement).fontSize) || 16),
      );
    measureFold(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => entry && measureFold(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // Where the rows start in the scroller's content, past the toolbar and column titles. It's
  // read again whenever the list or anything around it resizes, after layout, so scrolling
  // never forces one.
  useLayoutEffect(() => {
    const element = list.current;
    if (!windowed || !element) return;
    const parent = scrollParent(element);
    setScroller(parent);
    if (!parent) return;
    const read = () => {
      const offset = Math.round(
        element.getBoundingClientRect().top -
          parent.getBoundingClientRect().top -
          parent.clientTop +
          parent.scrollTop,
      );
      setScrollMargin((current) => (Math.abs(offset - current) > 1 ? offset : current));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    for (let node: Element | null = element; node && node !== parent; node = node.parentElement)
      observer.observe(node);
    return () => observer.disconnect();
  }, [windowed]);
  // oxlint-disable-next-line react/incompatible-library -- TanStack owns these functions.
  const virtualizer = useVirtualizer({
    count: windowed ? items.length : 0,
    enabled: windowed,
    getScrollElement: () => scroller,
    estimateSize: (index) => (items[index]?.kind === 'group' ? GROUP_HEIGHT : ROW_HEIGHT),
    getItemKey: (index) => items[index]?.key ?? index,
    // Start from where the scroller already is, so mounting never moves it.
    initialOffset: () => scroller?.scrollTop ?? 0,
    initialRect: { width: 0, height: 1000 },
    // A new row takes the size already known for it; the ResizeObserver reports its real
    // height after layout. Reading offsetHeight here would force a style recalc of every
    // new row inside React's commit.
    measureElement: (element, entry, instance) => {
      const box = entry?.borderBoxSize?.[0];
      if (box) return Math.round(box.blockSize);
      const index = Number(element.getAttribute('data-index'));
      return instance.measurementsCache[index]?.size ?? ROW_HEIGHT;
    },
    // Scroll updates render with React's own batching rather than one synchronous commit each.
    useFlushSync: false,
    overscan: 10,
    scrollMargin,
  });

  const groupBusy = (section: ToolTableSection) =>
    section.tools.some((tool) => editor.busy.has(tool.name));
  const toolRow = (section: ToolTableSection, tool: ToolSetting, at?: [number, number]) => (
    <ToolRow
      busy={editor.busy.has(tool.name)}
      editor={rowEditor}
      fold={fold}
      index={at?.[0]}
      key={tool.name}
      measure={at ? virtualizer.measureElement : undefined}
      mode={mode}
      position={at?.[1]}
      setSize={at ? section.tools.length : undefined}
      status={editor.status[tool.name]}
      tool={tool}
    />
  );

  let rows;
  if (windowed) {
    const shown = virtualizer.getVirtualItems();
    const first = shown[0];
    const last = shown.at(-1);
    const total = virtualizer.getTotalSize();
    const before = first ? first.start - scrollMargin : 0;
    const after = last ? total - (last.end - scrollMargin) : total;
    // The rows in view, still grouped under their sections.
    const runs: { section: number; entries: { item: TableItem; index: number }[] }[] = [];
    for (const { index } of shown) {
      const item = items[index];
      if (!item) continue;
      const run = runs.at(-1);
      if (run?.section === item.section) run.entries.push({ item, index });
      else runs.push({ section: item.section, entries: [{ item, index }] });
    }
    rows = (
      // The virtualizer keeps the view steady as rows measure; the browser's own scroll
      // anchoring would correct it a second time and pull the scroll back.
      <div
        className="[overflow-anchor:none]"
        ref={list}
        style={{ paddingTop: before, paddingBottom: after }}
      >
        {runs.map(({ section: at, entries }) => {
          const section = sections[at]!;
          const group = entries.find((entry) => entry.item.kind === 'group');
          const tools = entries.flatMap((entry) =>
            entry.item.kind === 'tool' ? [{ ...entry, item: entry.item }] : [],
          );
          const reserved = entries.filter((entry) => entry.item.kind === 'reserve');
          return (
            // The section names its group, so its rows load once in view, even with
            // the group's own row scrolled away.
            <section aria-label={section.title} data-tool-group={section.id} key={section.id}>
              {group ? (
                <GroupRow
                  busy={groupBusy(section)}
                  editor={rowEditor}
                  index={group.index}
                  measure={virtualizer.measureElement}
                  onToggle={toggle}
                  open={!collapsed.has(section.id)}
                  section={section}
                />
              ) : null}
              {tools.length ? (
                <ul className="grid" aria-label={`${section.title} tools`}>
                  {tools.map(({ item, index }) =>
                    toolRow(section, item.tool, [index, item.position]),
                  )}
                </ul>
              ) : null}
              {reserved.length ? (
                <div aria-hidden="true" className="grid">
                  {reserved.map(({ item, index }) => (
                    <span
                      className="min-h-11 border-b border-border/70"
                      data-index={index}
                      key={item.key}
                      ref={virtualizer.measureElement}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  } else {
    rows = sections.map((section) => {
      const open = !collapsed.has(section.id);
      return (
        <section aria-label={section.title} key={section.id}>
          <GroupRow
            busy={groupBusy(section)}
            editor={rowEditor}
            onToggle={toggle}
            open={open}
            section={section}
          />
          {open && section.tools.length ? (
            <ul className="grid" aria-label={`${section.title} tools`}>
              {section.tools.map((tool) => toolRow(section, tool))}
            </ul>
          ) : open && section.reserveRows ? (
            // Empty rows, each the height of a tool row, until the tools arrive.
            <div aria-hidden="true" className="grid">
              {Array.from({ length: section.reserveRows }, (_, index) => (
                <span className="min-h-11 border-b border-border/70" key={index} />
              ))}
            </div>
          ) : null}
        </section>
      );
    });
  }
  return (
    <TooltipProvider disableHoverableContent>
      <div
        aria-label={label}
        className="@container/tools min-w-0"
        data-slot="tools-table"
        ref={table}
        role="group"
      >
        <HeaderRow mode={mode} />
        {rows}
      </div>
    </TooltipProvider>
  );
}
