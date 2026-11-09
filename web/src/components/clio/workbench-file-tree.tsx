import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FileTreeIcon, FileTreeName } from '@/components/ai-elements/file-tree';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ResourceLoading } from './resource-states';
import { isChangedPath } from './workbench-shared';
import { sortedNodes, type WorkspaceFileNode } from './workbench-file-tree-model';

// Human copy for the server's typed `redacted` reasons
// (workspace_file_policy.workspace_read_redaction_reason). A folder carrying
// one of these is listed (the owner ruling is to show dot folders, not hide
// their existence) but its contents were never walked â€” the note explains why
// an expanded folder shows nothing, instead of silently looking empty.
const REDACTED_REASON_LABEL: Record<string, string> = {
  sandbox_child_cache: 'Sandbox cache â€” contents not shown',
};

/** One flat row of a Files tree; folders and files are keyed by path. */
export type FileTreeRow =
  | { kind: 'dir'; path: string; name: string; depth: number; open: boolean }
  | {
      kind: 'file';
      path: string;
      name: string;
      depth: number;
      alignWithFolders: boolean;
      icon?: ReactNode;
    }
  | { kind: 'note'; key: string; depth: number; label: string; tone?: 'muted' | 'error' }
  | { kind: 'loading'; key: string; depth: number; label: string }
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
}: {
  nodes: readonly WorkspaceFileNode[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  changedPaths?: ReadonlySet<string>;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
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
          result.push({ kind: 'file', path, name: node.name, depth, alignWithFolders });
          continue;
        }
        const open = expanded.has(path);
        result.push({ kind: 'dir', path, name: node.name, depth, open });
        if (!open) continue;
        if (node.entry.redacted) {
          result.push({
            kind: 'note',
            key: `${path}#note`,
            label: REDACTED_REASON_LABEL[node.entry.redacted] ?? 'Contents not shown.',
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
  }, [expanded, nodes, sorted]);

  return (
    <WindowedFileTree
      changedPaths={changedPaths}
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
  onSelect,
  onToggle,
}: {
  rows: readonly FileTreeRow[];
  selectedPath?: string;
  changedPaths?: ReadonlySet<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
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
      className="relative min-w-0 font-sans text-[12.5px]"
      ref={treeRef}
      role="tree"
      style={windowed ? { height: virtualizer.getTotalSize() } : undefined}
    >
      {items.map(({ row, top }) => (
        <TreeRowView
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
  onSelect,
  onToggle,
}: {
  row: FileTreeRow;
  top: number | undefined;
  selectedPath?: string;
  changedPaths?: ReadonlySet<string>;
  onSelect: (path: string) => void;
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
            'flex h-7 items-center truncate pr-2 text-[11.5px]',
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
            aria-label={`${row.open ? 'Collapse' : 'Expand'} folder ${row.name}`}
            className={cn(
              TREE_ROW_CLASS,
              // Spec `.zx.h`: top-level folders lead the list.
              row.depth === 0 && 'font-medium text-foreground',
            )}
            onClick={() => onToggle(row.path)}
            style={{ paddingLeft }}
            type="button"
          >
            <span aria-hidden="true" className="grid w-3 shrink-0 place-items-center text-faint">
              <ChevronRightIcon
                className={cn('size-3 transition-transform', row.open && 'rotate-90')}
              />
            </span>
            <FileTreeIcon>
              <Icon className="size-3.5 text-muted-foreground" />
            </FileTreeIcon>
            <FileTreeName>{row.name}</FileTreeName>
          </button>
        </div>
      );
    }
    case 'file': {
      const changed = isChangedPath(changedPaths, row.path);
      const selected = selectedPath === row.path;
      return (
        <div
          aria-label={changed ? `${row.name}, changed in this conversation` : undefined}
          aria-level={row.depth + 1}
          aria-selected={selected}
          className={cn(
            TREE_ROW_CLASS,
            changed && 'text-changed',
            selected && 'bg-accent text-accent-foreground hover:bg-accent',
          )}
          data-changed={changed || undefined}
          onClick={() => onSelect(row.path)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelect(row.path);
          }}
          role="treeitem"
          style={style}
          tabIndex={0}
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
          <FileTreeName>{row.name}</FileTreeName>
        </div>
      );
    }
  }
}
