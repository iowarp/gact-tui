import type { ScienceView } from '@clio/core/v3';
import { ListTreeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NodeFolder } from './node-folder';
import type { ScienceState, StudyNode } from './science-log-model';

/** A state chip: the state in text, tinted with the matching science-state token. */
export function ScienceStateChip({
  state,
  className,
}: {
  state: ScienceState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 text-[11px] leading-4',
        state.tone === 'running' &&
          'border-dashed border-status-running-foreground bg-status-running text-status-running-foreground',
        state.tone === 'supported' &&
          'border-status-supported-foreground bg-status-supported text-status-supported-foreground',
        state.tone === 'refuted' &&
          'border-status-refuted-foreground bg-status-refuted text-status-refuted-foreground',
        state.tone === 'superseded' &&
          'border-status-superseded-foreground bg-status-superseded text-status-superseded-foreground',
        state.tone === 'neutral' && 'border-border text-muted-foreground',
        className,
      )}
    >
      {state.label}
    </span>
  );
}

/** The node's kind in text, so a fork, a step and a reframe read differently without color. */
function kindLabel(node: StudyNode): string {
  if (node.kind === 'question') return 'Question';
  if (node.kind === 'hypothesis') return 'Hypothesis';
  if (node.kind === 'reframe') return 'Reframe';
  switch (node.branchRelation) {
    case 'fork':
      return 'Fork';
    case 'step':
      return 'Step';
    case 'delegated':
      return 'Delegated';
    case 'branch':
      return 'Branch';
    case 'root':
      return 'Root';
    default:
      return 'Branch';
  }
}

function tooltip(node: StudyNode): string {
  const parts = [`${kindLabel(node)}: ${node.title}`, `State: ${node.state.label}`];
  if (node.relation) parts.push(node.relation);
  if (node.note) parts.push(`Note: ${node.note}`);
  return parts.join('. ');
}

export interface StudyTreeProps {
  root: StudyNode;
  selectedBranch: string;
  /** Select a node: open its branch's entries (and focus its entry) in the panel below. */
  onSelect: (node: StudyNode) => void;
  onSelectEntry: (entryId: string) => void;
  /** Open the task row of a branch (its handle), when the app has one. */
  onOpenTask?: (handle: string) => void;
  /** Open a branch's node folder in the Files view. */
  onOpenFolder?: (path: string) => void;
  /** Whether a folder can be opened here; without it every folder opens. */
  folderAvailable?: (path: string) => boolean;
  /** The study's attached views; each branch lists the ones it attached. */
  views?: readonly ScienceView[];
  /** Open one of the study's views (its `view` entry id). */
  onOpenView?: (entry: string) => void;
}

/**
 * The study as a tree: the root question, its hypotheses, and the branches
 * under their parents. Every node says its kind and state in text; forks are
 * framed dashed and reframes dotted, each also labelled. Selecting a node
 * opens its branch below without leaving the session.
 */
export function StudyTree(props: StudyTreeProps) {
  return (
    <ul aria-label="Study tree" className="grid min-w-0 gap-1 text-xs" role="tree">
      <StudyTreeNode {...props} node={props.root} level={1} />
    </ul>
  );
}

function StudyTreeNode({
  node,
  level,
  selectedBranch,
  onSelect,
  onSelectEntry,
  onOpenTask,
  onOpenFolder,
  folderAvailable,
  views,
  onOpenView,
}: StudyTreeProps & { node: StudyNode; level: number }) {
  // A branch lists the views it attached; the root question lists the study's own.
  const attached =
    onOpenView && (node.kind === 'branch' || (node.kind === 'question' && level === 1))
      ? (views ?? []).filter((view) => view.session_id === node.branch)
      : [];
  const selected =
    node.kind !== 'hypothesis' && node.kind !== 'reframe' && node.branch === selectedBranch;
  const label = `${kindLabel(node)}: ${node.title}, ${node.state.label}`;
  return (
    <li
      aria-expanded={node.children.length ? true : undefined}
      aria-label={label}
      aria-level={level}
      aria-selected={selected}
      className="grid min-w-0 gap-1"
      data-kind={node.kind}
      data-relation={node.branchRelation}
      role="treeitem"
    >
      <div
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-2 py-1',
          node.branchRelation === 'fork' && 'border-dashed',
          node.kind === 'reframe' && 'border-dotted italic',
          node.kind === 'hypothesis' && 'border-transparent bg-muted/40',
          selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
        )}
      >
        <button
          className="flex min-w-0 flex-1 basis-32 items-baseline gap-1.5 overflow-hidden rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onSelect(node)}
          title={tooltip(node)}
          type="button"
        >
          <span className="shrink-0 font-medium text-muted-foreground">{kindLabel(node)}</span>
          <span className="min-w-0 truncate text-foreground">{node.title}</span>
        </button>
        <ScienceStateChip state={node.state} />
        {node.relation && node.kind !== 'hypothesis' ? (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {node.relation}
          </span>
        ) : null}
        {node.handle && onOpenTask ? (
          <Button
            aria-label={`Open the task of ${node.title}`}
            className="h-5 px-1.5 text-[11px]"
            onClick={() => onOpenTask(node.handle!)}
            size="xs"
            type="button"
            variant="ghost"
          >
            <ListTreeIcon aria-hidden="true" /> Task
          </Button>
        ) : null}
      </div>
      {node.folder ? (
        <NodeFolder
          className="pl-3"
          name={node.title}
          onOpen={
            onOpenFolder && (folderAvailable?.(node.folder) ?? true) ? onOpenFolder : undefined
          }
          path={node.folder}
        />
      ) : null}
      {attached.length ? (
        <p className="flex min-w-0 flex-wrap items-center gap-1 pl-3 text-[11px] text-muted-foreground">
          <span>{attached.length === 1 ? 'View' : 'Views'}</span>
          {attached.map((view) => (
            <button
              className="underline decoration-border underline-offset-2 hover:text-foreground"
              key={view.entry}
              onClick={() => onOpenView?.(view.entry)}
              type="button"
            >
              {view.title || 'Untitled view'}
            </button>
          ))}
        </p>
      ) : null}
      {node.derivedFrom.length ? (
        <p className="flex min-w-0 flex-wrap items-center gap-1 pl-3 text-[11px] text-muted-foreground">
          <span aria-hidden="true">↳</span> Derived from
          {node.derivedFrom.map((edge) => (
            <button
              className="underline decoration-border underline-offset-2 hover:text-foreground"
              key={edge.entry}
              onClick={() => onSelectEntry(edge.entry)}
              type="button"
            >
              {edge.title}
            </button>
          ))}
        </p>
      ) : null}
      {node.children.length ? (
        <ul className="ml-2 grid min-w-0 gap-1 border-l pl-2" role="group">
          {node.children.map((child) => (
            <StudyTreeNode
              key={child.key}
              level={level + 1}
              node={child}
              folderAvailable={folderAvailable}
              onOpenFolder={onOpenFolder}
              onOpenTask={onOpenTask}
              onSelect={onSelect}
              onSelectEntry={onSelectEntry}
              onOpenView={onOpenView}
              root={child}
              selectedBranch={selectedBranch}
              views={views}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
