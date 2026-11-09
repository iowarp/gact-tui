import type { KnowledgeSnapshot } from '@clio/core/v3';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileTextIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  GRAPH_ARROW,
  GRAPH_EDGE_STYLE,
  GRAPH_MARGIN,
  fitColumns,
  topLeftViewport,
  usePaneSize,
} from './graph-fit';
import {
  KNOWLEDGE_NODE,
  KNOWLEDGE_ROW,
  knowledgeNeighborhood,
  type KnowledgeGraphCard,
} from './knowledge-graph-model';
import { knowledgeLinkCount } from './knowledge-vault-stats';
import { StateView } from './primitives/state-view';

interface NoteNodeData extends Record<string, unknown> {
  card: KnowledgeGraphCard;
  onSelect: (path: string) => void;
}
interface MoreNodeData extends Record<string, unknown> {
  count: number;
  side: 'in' | 'out';
}
type NoteNode = Node<NoteNodeData, 'note'>;
type MoreNode = Node<MoreNodeData, 'more'>;
type GraphNode = NoteNode | MoreNode;

const nodeTypes = { note: NoteCard, more: MoreCard };
const { width, height } = KNOWLEDGE_NODE;
const EDGE = { markerEnd: GRAPH_ARROW, style: GRAPH_EDGE_STYLE };

/**
 * A vault's notes graph, full-bleed on a dotted canvas and laid out from the
 * top-left: the focused note with the notes that link to it on its left and those
 * it links to on its right. The column gap and then the scale shrink to fit the
 * pane, never below a readable size. Choosing a card focuses it and selects it.
 */
export function KnowledgeGraph({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: KnowledgeSnapshot;
  selected: string;
  onSelect: (path: string) => void;
}) {
  const container = useRef<HTMLElement>(null);
  const size = usePaneSize(container);
  const fit = fitColumns(size?.w, 3, width);
  const rows = size
    ? Math.floor((size.h / fit.zoom - 2 * GRAPH_MARGIN + (KNOWLEDGE_ROW - height)) / KNOWLEDGE_ROW)
    : undefined;
  const graph = knowledgeNeighborhood(snapshot, selected, { rows, gap: fit.gap });
  const nodes: GraphNode[] = [
    ...graph.cards.map(
      (card): NoteNode => ({
        id: card.id,
        type: 'note',
        position: { x: card.x, y: card.y },
        style: { width, height },
        data: { card, onSelect },
      }),
    ),
    ...graph.more.map(
      (more): MoreNode => ({
        id: `more:${more.side}`,
        type: 'more',
        position: { x: more.x, y: more.y },
        style: { width, height },
        data: { count: more.count, side: more.side },
      }),
    ),
  ];
  const edges: Edge[] = [
    ...graph.edges.map((edge) => ({ ...edge, ...EDGE })),
    ...graph.more.map((more) => ({
      id: `more:${more.side}`,
      source: more.side === 'in' ? `more:${more.side}` : (graph.focus ?? ''),
      target: more.side === 'in' ? (graph.focus ?? '') : `more:${more.side}`,
      style: { ...GRAPH_EDGE_STYLE, strokeDasharray: '3 3' },
    })),
  ];
  const focused = graph.cards.find((card) => card.side === 'focus');
  const viewport = topLeftViewport(fit.zoom);
  return (
    <section
      aria-label="Note graph"
      className="h-full min-h-0 min-w-0 overflow-hidden bg-background"
      ref={container}
    >
      {focused ? (
        <ReactFlow<GraphNode, Edge>
          key={graph.focus}
          defaultViewport={viewport}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          minZoom={0.2}
          maxZoom={1.8}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <ApplyViewport viewport={viewport} />
          <Background color="var(--border)" gap={16} size={1.2} variant={BackgroundVariant.Dots} />
          <Controls
            aria-label="Note graph controls"
            className="!m-3 !gap-0.5 !border-0 !bg-transparent !shadow-none [&_button]:!size-7 [&_button]:!rounded-md [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!fill-muted-foreground [&_button:hover]:!bg-hover [&_button:hover]:!fill-foreground"
            position="bottom-right"
            showInteractive={false}
          />
        </ReactFlow>
      ) : (
        <StateView kind="empty" size="viewer" title="No notes match this view" />
      )}
    </section>
  );
}

/** Re-anchor when the pane's fit changes; a reader's own zoom and pan stay otherwise. */
function ApplyViewport({ viewport }: { viewport: Viewport }) {
  const { setViewport } = useReactFlow();
  const { x, y, zoom } = viewport;
  useEffect(() => {
    void setViewport({ x, y, zoom });
  }, [setViewport, x, y, zoom]);
  return null;
}

const HANDLE = '!size-0 !min-h-0 !min-w-0 !border-0 !opacity-0';

function NoteCard({ data }: NodeProps<NoteNode>) {
  const { card } = data;
  const focus = card.side === 'focus';
  const links = knowledgeLinkCount(card.links);
  return (
    <div className="relative" style={{ width, height }}>
      <Handle className={HANDLE} position={Position.Left} type="target" />
      <button
        aria-label={`${card.title}, ${links}`}
        aria-pressed={focus}
        className={cn(
          'nodrag nopan grid h-full w-full grid-cols-[14px_minmax(0,1fr)] content-center gap-x-2 rounded-md border bg-card px-2.5 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
          focus && 'border-primary ring-1 ring-primary/40',
        )}
        onClick={() => data.onSelect(card.id)}
        title={`${card.title} (${links})`}
        type="button"
      >
        <FileTextIcon aria-hidden="true" className="row-span-2 size-3.5 text-muted-foreground" />
        <span
          className={cn('truncate text-[12.5px] leading-4 font-semibold', focus && 'text-primary')}
        >
          {card.title}
        </span>
        <span className="truncate text-[11px] leading-[14px] text-muted-foreground">{links}</span>
      </button>
      <Handle className={HANDLE} position={Position.Right} type="source" />
    </div>
  );
}

function MoreCard({ data }: NodeProps<MoreNode>) {
  return (
    <div className="relative" style={{ width, height }}>
      {data.side === 'out' ? (
        <Handle className={HANDLE} position={Position.Left} type="target" />
      ) : null}
      <div className="flex h-full items-center rounded-md border border-dashed px-2.5 text-[11px] text-muted-foreground tabular-nums">
        {data.count.toLocaleString()} more {data.count === 1 ? 'note' : 'notes'}
      </div>
      {data.side === 'in' ? (
        <Handle className={HANDLE} position={Position.Right} type="source" />
      ) : null}
    </div>
  );
}
