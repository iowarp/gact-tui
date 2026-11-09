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
/** Each level: 16 px to the guide line, 8 px after it (the old ml-4 + pl-2). */
const INDENT_PX = 24;

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
      className="relative min-w-0 font-mono text-sm"
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
    paddingLeft: row.depth * INDENT_PX,
    ...(top === undefined ? {} : { position: 'absolute' as const, top, left: 0, right: 0 }),
  };
  const guides = Array.from({ length: row.depth }, (_, level) => (
    <span
      aria-hidden="true"
      className="absolute inset-y-0 border-l border-border"
      key={level}
      style={{ left: 16 + level * INDENT_PX }}
    />
  ));
  if (row.kind === 'note')
    return (
      <p className="relative h-7 px-2 py-1 text-xs text-muted-foreground italic" style={style}>
        {guides}
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
        className="relative h-7"
        role="treeitem"
        style={style}
      >
        {guides}
        <button
          aria-label={`${open ? 'Collapse' : 'Expand'} folder ${node.name}`}
          className="flex h-7 w-full min-w-0 cursor-pointer items-center gap-1 rounded border-none bg-transparent px-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => onToggle(path)}
          type="button"
        >
          <ChevronRightIcon
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
          <FileTreeIcon>
            <Icon className="size-4 text-info" />
          </FileTreeIcon>
          <FileTreeName>{node.name}</FileTreeName>
        </button>
      </div>
    );
  }
  const changed = isChangedPath(changedPaths, path);
  return (
    <div
      aria-label={changed ? `${node.name}, changed in this conversation` : undefined}
      aria-level={row.depth + 1}
      aria-selected={selectedPath === path}
      className={cn(
        'relative flex h-7 w-full min-w-0 cursor-pointer items-center gap-1 rounded px-1.5 transition-colors hover:bg-muted/50',
        selectedPath === path && 'bg-muted',
        changed && 'text-changed',
      )}
      data-changed={changed || undefined}
      onClick={() => onSelect(path)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect(path);
      }}
      role="treeitem"
      style={{ ...style, paddingLeft: row.depth * INDENT_PX + 6 }}
      tabIndex={0}
    >
      {guides}
      {row.alignWithFolders ? <span aria-hidden="true" className="size-4 shrink-0" /> : null}
      <FileTreeIcon>
        <FileIcon className="size-4 text-muted-foreground" />
      </FileTreeIcon>
      <FileTreeName>{node.name}</FileTreeName>
    </div>
  );
}
