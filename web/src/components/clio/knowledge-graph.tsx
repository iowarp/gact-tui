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
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import {
  KNOWLEDGE_NODE,
  knowledgeNeighborhood,
  type KnowledgeGraphCard,
  type KnowledgeNeighborhood,
} from './knowledge-graph-model';
import { knowledgeLinkCount } from './knowledge-vault-stats';
import { StateView } from './primitives/state-view';

interface NoteNodeData extends Record<string, unknown> {
  card: KnowledgeGraphCard;
  onSelect: (path: string) => void;
}
interface MoreNodeData extends Record<string, unknown> {
  count: number;
}
type NoteNode = Node<NoteNodeData, 'note'>;
type MoreNode = Node<MoreNodeData, 'more'>;
type GraphNode = NoteNode | MoreNode;

const nodeTypes = { note: NoteCard, more: MoreCard };
const { width, height } = KNOWLEDGE_NODE;
const FIT = { padding: 0.06, maxZoom: 1 };
/** Below this a card's name is unreadable: center the focused note instead of fitting all. */
const READABLE_ZOOM = 0.75;
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
  const graph = useMemo(() => knowledgeNeighborhood(snapshot, selected), [snapshot, selected]);
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
          data: { count: more.count },
        }),
      ),
    ],
    [graph, onSelect],
  );
  const edges = useMemo<Edge[]>(
    () => graph.edges.map((edge) => ({ ...edge, ...EDGE })),
    [graph.edges],
  );
  const focused = graph.cards.find((card) => card.side === 'focus');
  return (
    <section
      aria-label="Note graph"
      className="h-full min-h-0 min-w-0 overflow-hidden bg-background"
      ref={container}
    >
      {focused ? (
        <ReactFlow<GraphNode, Edge>
          key={graph.focus}
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
          <FitOnResize container={container} graph={graph} />
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

/**
 * Fit the neighborhood on focus and on pane resize, never below a readable size:
 * a pane too narrow for both sides starts at the focused note, the rest a pan away.
 */
function FitOnResize({
  container,
  graph,
}: {
  container: RefObject<HTMLElement | null>;
  graph: KnowledgeNeighborhood;
}) {
  const { fitView, setViewport } = useReactFlow();
  useEffect(() => {
    const element = container.current;
    const placed = [...graph.cards, ...graph.more];
    const focus = graph.cards.find((card) => card.side === 'focus');
    if (!element || !focus) return;
    const left = Math.min(...placed.map((node) => node.x));
    const right = Math.max(...placed.map((node) => node.x)) + width;
    const top = Math.min(...placed.map((node) => node.y));
    const bottom = Math.max(...placed.map((node) => node.y)) + height;
    let frame = 0;
    const fit = () => {
      const w = element.clientWidth;
      const h = element.clientHeight;
      if (!w || !h) return;
      const pad = 1 + FIT.padding * 2;
      const whole = Math.min(w / ((right - left) * pad), h / ((bottom - top) * pad), FIT.maxZoom);
      if (whole >= READABLE_ZOOM) {
        void fitView(FIT);
        return;
      }
      const zoom = READABLE_ZOOM;
      void setViewport({
        x: w / 2 - (focus.x + width / 2) * zoom,
        y: h / 2 - ((top + bottom) / 2) * zoom,
        zoom,
      });
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [container, fitView, graph, setViewport]);
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
    <div
      className="flex items-center px-2.5 text-[11px] text-muted-foreground tabular-nums"
      style={{ width, height }}
    >
      {data.count.toLocaleString()} more {data.count === 1 ? 'note' : 'notes'}
    </div>
  );
}
