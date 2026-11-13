import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FileTreeIcon } from '@/components/ai-elements/file-tree';
import { Button } from '@/components/ui/button';
import { formatBytes, formatCompactBytes } from '@/lib/format';
import { splitForMiddleTruncation } from '@/lib/middle-truncate';
import { isTextTruncated } from '@/lib/truncation';
import { cn } from '@/lib/utils';
import { MetaValue } from './primitives/tag';
import { ResourceLoading } from './resource-states';
import { StateView } from './primitives/state-view';
import { changeCountFor, isChangedPath, type ChangeCounts } from './workbench-shared';
import { sortedNodes, type WorkspaceFileNode } from './workbench-file-tree-model';
import { plural, t, ph } from '@lingui/core/macro';

// Human copy for the server's typed `redacted` reasons
// (workspace_file_policy.workspace_read_redaction_reason). A folder carrying
// one of these is listed (the owner ruling is to show dot folders, not hide
// their existence) but its contents were never walked — the note explains why
// an expanded folder shows nothing, instead of silently looking empty.
const REDACTED_REASON_LABEL: Record<string, string> = {
  sandbox_child_cache: t`Sandbox cache — contents not shown`,
};

/** Characters kept at a cut name's end, so dated siblings and extensions stay apart. */
const NAME_TAIL = 8;

/** A row name cut in the middle (`2026-11-01_ane…tion.csv`); keyboard focus reads it whole. */
function TreeName({ name }: { name: string }) {
  const [head, tail] = splitForMiddleTruncation(name, NAME_TAIL);
  return (
    <span className="flex min-w-0 flex-1 overflow-hidden whitespace-nowrap" data-tree-name="">
      <span className="min-w-0 truncate" data-full-text={name}>
        {head}
      </span>
      {tail ? <span className="shrink-0">{tail}</span> : null}
    </span>
  );
}

/**
 * The row's hover text: its name only while the name is cut, then its detail
 * ("12 lines added, 1.2 KB"). Measured on hover, so an uncut row adds nothing.
 */
function titleRow(row: HTMLElement, name: string, detail?: string) {
  const head = row.querySelector<HTMLElement>('[data-tree-name] > [data-full-text]');
  const title = [head && isTextTruncated(head) ? name : undefined, detail]
    .filter(Boolean)
    .join('\n');
  if (title) row.setAttribute('title', title);
  else row.removeAttribute('title');
}

/** One flat row of a Files tree; folders and files are keyed by path. */
export type FileTreeRow =
  | {
      kind: 'dir';
      path: string;
      name: string;
      depth: number;
      open: boolean;
      /** Replaces the folder glyph (an NDP organization or dataset). */
      icon?: ReactNode;
      /** One quiet trailing count ("38 datasets"). */
      meta?: string;
    }
  | {
      kind: 'file';
      path: string;
      name: string;
      depth: number;
      alignWithFolders: boolean;
      icon?: ReactNode;
      /** Bytes, shown as the trailing meta when the conversation did not change it. */
      size?: number;
      /** A trailing word when there is no size (an NDP resource's format). */
      meta?: string;
      /** Row actions, shown in place of the trailing meta on hover or focus. */
      actions?: ReactNode;
      /** An action that stays visible (an NDP stream's start). */
      pinned?: ReactNode;
    }
  | { kind: 'note'; key: string; depth: number; label: string; tone?: 'muted' | 'error' }
  | { kind: 'loading'; key: string; depth: number; label: string }
  /** A folder that couldn't be listed: what failed, why on hover, and Retry. */
  | {
      kind: 'error';
      key: string;
      depth: number;
      label: string;
      detail?: string;
      onRetry: () => void;
    }
  | {
      kind: 'more';
      key: string;
      depth: number;
      label: string;
      disabled: boolean;
      onActivate: () => void;
    };

const ROW_HEIGHT_PX = 28;
/** Small trees render every row; larger ones only the rows in view. */
const WINDOW_ABOVE_ROWS = 150;
/** Spec `.zx` rows: 8 px padding, then 20 px per level and no guide lines. */
const ROW_PAD_PX = 8;
const INDENT_PX = 20;
const TREE_ROW_CLASS =
  'flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[6px] border-none bg-transparent pr-2 text-left whitespace-nowrap transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

const rowKey = (row: FileTreeRow) =>
  row.kind === 'dir' || row.kind === 'file' ? row.path : row.key;

/**
 * The Files list: a flat, windowed tree. Folders sort their children only when
 * opened, and a folder with thousands of files mounts only the rows in view.
 */
export function WorkbenchFileTree({
  nodes,
  selectedPath,
  onSelect,
  changedPaths,
  changeCounts,
  defaultExpanded,
  countFolders,
  label,
}: {
  nodes: readonly WorkspaceFileNode[];
  /** Trail each folder row with how many items it holds. */
  countFolders?: boolean;
  selectedPath?: string;
  /** Without it, file rows are listed but cannot be chosen. */
  onSelect?: (path: string) => void;
  changedPaths?: ReadonlySet<string>;
  changeCounts?: ChangeCounts;
  /** Folders open on the first render. */
  defaultExpanded?: readonly string[];
  label?: string;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(defaultExpanded));
  const toggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }, []);
  const [sorted] = useState(() => new WeakMap<WorkspaceFileNode, WorkspaceFileNode[]>());
  const rows = useMemo(() => {
    const result: FileTreeRow[] = [];
    const walk = (level: readonly WorkspaceFileNode[], depth: number) => {
      const alignWithFolders = level.some((node) => node.entry.type === 'dir');
      for (const node of level) {
        const path = node.entry.path;
        if (node.entry.type !== 'dir') {
          result.push({
            kind: 'file',
            path,
            name: node.name,
            depth,
            alignWithFolders,
            size: node.entry.size,
          });
          continue;
        }
        const open = expanded.has(path);
        const count = node.children.size;
        result.push({
          kind: 'dir',
          path,
          name: node.name,
          depth,
          open,
          meta: countFolders ? plural(count, { one: '# item', other: '# items' }) : undefined,
        });
        if (!open) continue;
        if (node.entry.redacted) {
          result.push({
            kind: 'note',
            key: `${path}#note`,
            label: REDACTED_REASON_LABEL[node.entry.redacted] ?? t`Contents not shown.`,
            depth: depth + 1,
          });
          continue;
        }
        let children = sorted.get(node);
        if (!children) {
          children = sortedNodes(node.children);
          sorted.set(node, children);
        }
        walk(children, depth + 1);
      }
    };
    walk(nodes, 0);
    return result;
  }, [countFolders, expanded, nodes, sorted]);

  return (
    <WindowedFileTree
      changeCounts={changeCounts}
      changedPaths={changedPaths}
      label={label}
      onSelect={onSelect}
      onToggle={toggle}
      rows={rows}
      selectedPath={selectedPath}
    />
  );
}

/**
 * Renders flat tree rows, windowed above {@link WINDOW_ABOVE_ROWS} so a paged
 * or eagerly listed folder of any size mounts only the rows in view.
 */
export function WindowedFileTree({
  rows,
  selectedPath,
  changedPaths,
  changeCounts,
  onSelect,
  onToggle,
  label,
}: {
  rows: readonly FileTreeRow[];
  selectedPath?: string;
  changedPaths?: ReadonlySet<string>;
  changeCounts?: ChangeCounts;
  onSelect?: (path: string) => void;
  onToggle: (path: string) => void;
  label?: string;
}) {
  const treeRef = useRef<HTMLDivElement>(null);
  const windowed = rows.length > WINDOW_ABOVE_ROWS;
  const [scrollMargin, setScrollMargin] = useState(0);
  const scrollElement = useCallback(
    () =>
      treeRef.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ??
      treeRef.current?.parentElement ??
      null,
    [],
  );
  useLayoutEffect(() => {
    const tree = treeRef.current;
    const viewport = scrollElement();
    if (!windowed || !tree || !viewport) return;
    setScrollMargin(
      tree.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop,
    );
  }, [scrollElement, windowed]);
  // oxlint-disable-next-line react/incompatible-library -- TanStack owns these functions.
  const virtualizer = useVirtualizer({
    count: rows.length,
    enabled: windowed,
    estimateSize: () => ROW_HEIGHT_PX,
    getItemKey: (index) => rowKey(rows[index]),
    getScrollElement: scrollElement,
    overscan: 12,
    scrollMargin,
  });
  const items = windowed
    ? virtualizer
        .getVirtualItems()
        .map((item) => ({ row: rows[item.index], top: item.start - scrollMargin }))
    : rows.map((row) => ({ row, top: undefined }));

  return (
    <div
      aria-label={label}
      className="relative min-w-0 font-sans text-menu"
      ref={treeRef}
      role="tree"
      style={windowed ? { height: virtualizer.getTotalSize() } : undefined}
    >
      {items.map(({ row, top }) => (
        <TreeRowView
          changeCounts={changeCounts}
          changedPaths={changedPaths}
          key={rowKey(row)}
          onSelect={onSelect}
          onToggle={onToggle}
          row={row}
          selectedPath={selectedPath}
          top={top}
        />
      ))}
    </div>
  );
}

function TreeRowView({
  row,
  top,
  selectedPath,
  changedPaths,
  changeCounts,
  onSelect,
  onToggle,
}: {
  row: FileTreeRow;
  top: number | undefined;
  selectedPath?: string;
  changedPaths?: ReadonlySet<string>;
  changeCounts?: ChangeCounts;
  onSelect?: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  const placed = top === undefined ? {} : { position: 'absolute' as const, top, left: 0, right: 0 };
  const paddingLeft = ROW_PAD_PX + row.depth * INDENT_PX;
  const style = { paddingLeft, ...placed };
  switch (row.kind) {
    case 'note':
      return (
        <p
          className={cn(
            'flex h-7 items-center truncate pr-2 text-label',
            row.tone === 'error' ? 'text-destructive' : 'text-faint italic',
          )}
          role={row.tone === 'error' ? 'alert' : undefined}
          style={style}
        >
          {row.label}
        </p>
      );
    case 'loading':
      return (
        <div className="flex h-7 items-center pr-2" style={style}>
          <ResourceLoading label={row.label} variant="line" />
        </div>
      );
    case 'error':
      return (
        <div className="pr-1" style={style}>
          <StateView
            action={{ label: t`Retry`, onClick: row.onRetry }}
            className="px-0"
            kind="error"
            size="row"
            title={<span title={row.detail}>{row.label}</span>}
          />
        </div>
      );
    case 'more':
      return (
        <div className="flex h-7 items-center pr-1" style={style}>
          <Button
            className="h-6 px-2 text-xs"
            disabled={row.disabled}
            onClick={row.onActivate}
            size="sm"
            variant="ghost"
          >
            {row.label}
          </Button>
        </div>
      );
    case 'dir': {
      const Icon = row.open ? FolderOpenIcon : FolderIcon;
      return (
        <div
          aria-expanded={row.open}
          aria-level={row.depth + 1}
          className="h-7"
          role="treeitem"
          style={placed}
        >
          <button
            aria-label={
              row.open
                ? t`Collapse folder ${ph({ name: row.name })}`
                : t`Expand folder ${ph({ name: row.name })}`
            }
            className={cn(
              TREE_ROW_CLASS,
              // Spec `.zx.h`: top-level folders lead the list.
              row.depth === 0 && 'font-medium text-foreground',
            )}
            onClick={() => onToggle(row.path)}
            onPointerEnter={(event) => titleRow(event.currentTarget, row.name)}
            style={{ paddingLeft }}
            type="button"
          >
            <span aria-hidden="true" className="grid w-3 shrink-0 place-items-center text-faint">
              <ChevronRightIcon
                className={cn('size-3 transition-transform', row.open && 'rotate-90')}
              />
            </span>
            <FileTreeIcon className="[&_svg]:text-muted-foreground">
              {row.icon ?? <Icon className="size-3.5" />}
            </FileTreeIcon>
            <TreeName name={row.name} />
            {row.meta ? (
              <span className="ml-auto shrink-0 pl-2 text-label font-normal text-faint tabular-nums">
                {row.meta}
              </span>
            ) : null}
          </button>
        </div>
      );
    }
    case 'file': {
      const changed = isChangedPath(changedPaths, row.path);
      const selected = selectedPath === row.path;
      const added = changed ? changeCountFor(changeCounts, row.path) : undefined;
      const sizeKnown = row.size !== undefined && row.size >= 0;
      const trailing = added ? `+${added}` : sizeKnown ? formatCompactBytes(row.size!) : row.meta;
      const detail = [
        added ? plural(added, { one: '# line added', other: '# lines added' }) : undefined,
        sizeKnown ? formatBytes(row.size!) : row.meta,
      ]
        .filter(Boolean)
        .join(', ');
      return (
        <div
          aria-label={
            changed ? t`${ph({ name: row.name })}, changed in this conversation` : row.name
          }
          aria-level={row.depth + 1}
          aria-selected={selected}
          className={cn(
            TREE_ROW_CLASS,
            'group/tree-row',
            !onSelect && 'cursor-default hover:bg-transparent',
            changed && 'text-changed',
            selected && 'bg-accent text-accent-foreground hover:bg-accent',
          )}
          data-changed={changed || undefined}
          onClick={onSelect ? () => onSelect(row.path) : undefined}
          onKeyDown={
            onSelect
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelect(row.path);
                }
              : undefined
          }
          onPointerEnter={(event) => titleRow(event.currentTarget, row.name, detail)}
          role="treeitem"
          style={style}
          tabIndex={onSelect ? 0 : undefined}
          title={detail || undefined}
        >
          {row.alignWithFolders ? <span aria-hidden="true" className="w-3 shrink-0" /> : null}
          <FileTreeIcon
            className={
              changed || selected
                ? '[&_svg]:text-accent-foreground'
                : row.icon
                  ? undefined
                  : '[&_svg]:text-muted-foreground'
            }
          >
            {row.icon ?? <FileIcon className="size-3.5" />}
          </FileTreeIcon>
          <TreeName name={row.name} />
          {trailing || row.actions || row.pinned ? (
            <span className="ml-auto flex min-w-0 shrink-0 items-center gap-2 pl-2">
              {trailing ? (
                // Spec `.zx .t`: one quiet trailing meta, `+N` on a changed file, else its size
                // or word; a row with actions shows them there on hover or focus instead.
                <span
                  className={cn(
                    'flex',
                    row.actions &&
                      'group-focus-visible/tree-row:hidden group-has-[:focus-visible]/tree-row:hidden group-hover/tree-row:hidden',
                  )}
                >
                  {added || sizeKnown ? (
                    <MetaValue className={cn('text-faint', selected && 'text-accent-foreground')}>
                      {trailing}
                    </MetaValue>
                  ) : (
                    <span
                      className={cn(
                        'max-w-40 truncate text-caption text-faint',
                        selected && 'text-accent-foreground',
                      )}
                    >
                      {trailing}
                    </span>
                  )}
                </span>
              ) : null}
              {row.actions || row.pinned ? (
                // The row's own controls; a click or key on them never selects the row.
                <span
                  className="-my-0.5 -mr-1 flex items-center gap-px"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  role="none"
                >
                  {row.pinned}
                  {row.actions ? (
                    <span className="hidden items-center gap-px group-focus-visible/tree-row:flex group-has-[:focus-visible]/tree-row:flex group-hover/tree-row:flex">
                      {row.actions}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      );
    }
  }
}
