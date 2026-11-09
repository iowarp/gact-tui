import type { KnowledgeSnapshot } from '@clio/core/v3';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileTextIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import {
  KNOWLEDGE_COLUMN,
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
/** Space kept clear above and below the columns. */
const MARGIN = 24;
/** A tall pane still shows a bounded column; the rest are counted. */
const MAX_ROWS = 10;
const EDGE = {
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: 'var(--muted-foreground)',
    width: 14,
    height: 14,
  },
  style: { stroke: 'var(--muted-foreground)', strokeWidth: 1 },
};

/**
 * A vault's notes graph, full-bleed on a dotted canvas: the focused note with the
 * notes that link to it on its left and those it links to on its right. Choosing a
 * card focuses it and selects it in the vault.
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
  const rows = size
    ? Math.min(
        MAX_ROWS,
        Math.floor((size.h - 2 * MARGIN + (KNOWLEDGE_ROW - height)) / KNOWLEDGE_ROW),
      )
    : 0;
  const graph = useMemo(
    () => knowledgeNeighborhood(snapshot, selected, rows),
    [snapshot, selected, rows],
  );
  const nodes = useMemo<GraphNode[]>(
    () => [
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
    ],
    [graph, onSelect],
  );
  const edges = useMemo<Edge[]>(
    () => [
      ...graph.edges.map((edge) => ({ ...edge, ...EDGE })),
      ...graph.more.map((more) => ({
        id: `more:${more.side}`,
        source: more.side === 'in' ? `more:${more.side}` : (graph.focus ?? ''),
        target: more.side === 'in' ? (graph.focus ?? '') : `more:${more.side}`,
        style: { ...EDGE.style, strokeDasharray: '3 3' },
      })),
    ],
    [graph],
  );
  const focused = graph.cards.find((card) => card.side === 'focus');
  return (
    <section
      aria-label="Note graph"
      className="h-full min-h-0 min-w-0 overflow-hidden bg-background"
      ref={container}
    >
      {!size ? null : focused ? (
        <ReactFlow<GraphNode, Edge>
          key={graph.focus}
          defaultViewport={centered(size)}
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
          <CenterOnResize size={size} />
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

/** The focused note centred at 100%: cards keep their size and the rest is a pan away. */
function centered({ w, h }: { w: number; h: number }) {
  return { x: w / 2 - (KNOWLEDGE_COLUMN + width / 2), y: h / 2, zoom: 1 };
}

function usePaneSize(container: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number }>();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const w = element.clientWidth;
        const h = element.clientHeight;
        if (w && h) setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [container]);
  return size;
}

function CenterOnResize({ size }: { size: { w: number; h: number } }) {
  const { setViewport } = useReactFlow();
  useEffect(() => {
    void setViewport(centered(size));
  }, [setViewport, size]);
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
