import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileTreeIcon, FileTreeName } from '@/components/ai-elements/file-tree';
import { cn } from '@/lib/utils';
import { isChangedPath } from './workbench-shared';
import { sortedNodes, type WorkspaceFileNode } from './workbench-file-tree-model';

// Human copy for the server's typed `redacted` reasons
// (workspace_file_policy.workspace_read_redaction_reason). A folder carrying
// one of these is listed (the owner ruling is to show dot folders, not hide
// their existence) but its contents were never walked — the note explains why
// an expanded folder shows nothing, instead of silently looking empty.
const REDACTED_REASON_LABEL: Record<string, string> = {
  sandbox_child_cache: 'Sandbox cache — contents not shown',
};

type TreeRow =
  | { kind: 'node'; node: WorkspaceFileNode; depth: number; alignWithFolders: boolean }
  | { kind: 'note'; path: string; label: string; depth: number };

const ROW_HEIGHT_PX = 28;
/** Small trees render every row; larger ones only the rows in view. */
const WINDOW_ABOVE_ROWS = 150;
/** Spec `.zx` rows: 8 px padding, then 20 px per level and no guide lines. */
const ROW_PAD_PX = 8;
const INDENT_PX = 20;
const TREE_ROW_CLASS =
  'flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[6px] border-none bg-transparent pr-2 text-left whitespace-nowrap transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

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
  const treeRef = useRef<HTMLDivElement>(null);
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
    const result: TreeRow[] = [];
    const walk = (level: readonly WorkspaceFileNode[], depth: number) => {
      const alignWithFolders = level.some((node) => node.entry.type === 'dir');
      for (const node of level) {
        result.push({ kind: 'node', node, depth, alignWithFolders });
        if (node.entry.type !== 'dir' || !expanded.has(node.entry.path)) continue;
        if (node.entry.redacted) {
          result.push({
            kind: 'note',
            path: `${node.entry.path}#note`,
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
    getItemKey: (index) => {
      const row = rows[index];
      return row.kind === 'node' ? row.node.entry.path : row.path;
    },
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
          expanded={expanded}
          key={row.kind === 'node' ? row.node.entry.path : row.path}
          onSelect={onSelect}
          onToggle={toggle}
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
  expanded,
  selectedPath,
  changedPaths,
  onSelect,
  onToggle,
}: {
  row: TreeRow;
  top: number | undefined;
  expanded: ReadonlySet<string>;
  selectedPath?: string;
  changedPaths?: ReadonlySet<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  const style = {
    paddingLeft: ROW_PAD_PX + row.depth * INDENT_PX,
    ...(top === undefined ? {} : { position: 'absolute' as const, top, left: 0, right: 0 }),
  };
  if (row.kind === 'note')
    return (
      <p className="flex h-7 items-center pr-2 text-[11.5px] text-faint italic" style={style}>
        {row.label}
      </p>
    );
  const { node } = row;
  const path = node.entry.path;
  if (node.entry.type === 'dir') {
    const open = expanded.has(path);
    const Icon = open ? FolderOpenIcon : FolderIcon;
    return (
      <div
        aria-expanded={open}
        aria-level={row.depth + 1}
        className="h-7"
        role="treeitem"
        style={top === undefined ? undefined : { position: 'absolute', top, left: 0, right: 0 }}
      >
        <button
          aria-label={`${open ? 'Collapse' : 'Expand'} folder ${node.name}`}
          className={TREE_ROW_CLASS}
          onClick={() => onToggle(path)}
          style={{ paddingLeft: style.paddingLeft }}
          type="button"
        >
          <span aria-hidden="true" className="grid w-3 shrink-0 place-items-center text-faint">
            <ChevronRightIcon className={cn('size-3 transition-transform', open && 'rotate-90')} />
          </span>
          <FileTreeIcon>
            <Icon className="size-3.5 text-muted-foreground" />
          </FileTreeIcon>
          <FileTreeName>{node.name}</FileTreeName>
        </button>
      </div>
    );
  }
  const changed = isChangedPath(changedPaths, path);
  const selected = selectedPath === path;
  return (
    <div
      aria-label={changed ? `${node.name}, changed in this conversation` : undefined}
      aria-level={row.depth + 1}
      aria-selected={selected}
      className={cn(
        TREE_ROW_CLASS,
        changed && 'text-changed',
        selected && 'bg-accent text-accent-foreground hover:bg-accent',
      )}
      data-changed={changed || undefined}
      onClick={() => onSelect(path)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect(path);
      }}
      role="treeitem"
      style={style}
      tabIndex={0}
    >
      {row.alignWithFolders ? <span aria-hidden="true" className="w-3 shrink-0" /> : null}
      <FileTreeIcon>
        <FileIcon
          className={cn(
            'size-3.5',
            changed || selected ? 'text-accent-foreground' : 'text-muted-foreground',
          )}
        />
      </FileTreeIcon>
      <FileTreeName>{node.name}</FileTreeName>
    </div>
  );
}
