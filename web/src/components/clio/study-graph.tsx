import type { ScienceStudy } from '@clio/core/v3';
import { graphlib, layout } from '@dagrejs/dagre';
import {
  Background,
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
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ENTRY_TYPE_LABELS } from './science-log-model';
import {
  studyGraph,
  studyGraphNeighborhood,
  studyGraphOverview,
  type StudyGraphModel,
  type StudyGraphNode,
} from './study-graph-model';
import { ScienceStateChip } from './study-tree';

interface EntryNodeData extends Record<string, unknown> {
  entry: StudyGraphNode;
  selected: boolean;
  onSelect: (id: string) => void;
}
type EntryNode = Node<EntryNodeData, 'science-entry'>;
type PositionedEntry = Pick<EntryNode, 'id' | 'type' | 'position' | 'style'> & {
  entry: StudyGraphNode;
};
const nodeTypes = { 'science-entry': EntryCard };
const width = 304;
const height = 128;

export type StudyGraphScope = 'all' | 'linked';

export interface StudyGraphProps {
  study: ScienceStudy;
  selectedEntry?: string;
  onSelectEntry: (id: string) => void;
  scope: StudyGraphScope;
  onScopeChange: (scope: StudyGraphScope) => void;
}

/** Explore the study's actual links, then select a node to read its original record. */
export function StudyGraph({
  study,
  selectedEntry,
  onSelectEntry,
  scope,
  onScopeChange,
}: StudyGraphProps) {
  const container = useRef<HTMLDivElement>(null);
  const model = useMemo(() => studyGraph(study), [study]);
  // The whole study draws each experiment's observations as one node, so a large
  // study stays readable; the linked scope shows the individual entries.
  const overview = useMemo(() => studyGraphOverview(study, model), [study, model]);
  const focused = scope === 'linked' && selectedEntry ? selectedEntry : undefined;
  const graph = useMemo(() => {
    if (!focused) return layoutStudyGraph(overview);
    const source = focused.startsWith('group:') ? overview : model;
    return layoutStudyGraph(studyGraphNeighborhood(source, focused));
  }, [model, overview, focused]);
  const nodes = useMemo<EntryNode[]>(
    () =>
      graph.nodes.map(({ entry, ...node }) => ({
        ...node,
        data: {
          entry,
          selected:
            node.id === selectedEntry ||
            Boolean(selectedEntry && entry.members?.includes(selectedEntry)),
          onSelect: onSelectEntry,
        },
      })),
    [graph.nodes, selectedEntry, onSelectEntry],
  );
  const entryCount = graph.nodes.reduce(
    (total, { entry }) => total + (entry.members?.length ?? 1),
    0,
  );
  const linkCount = graph.edges.reduce(
    (total, edge) => total + Number((edge.data as { count?: number } | undefined)?.count ?? 1),
    0,
  );
  if (!model.nodes.length)
    return <p className="text-sm text-muted-foreground">No entries to graph yet.</p>;
  return (
    <section aria-label="Study relationship graph" className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {entryCount} entries, {linkCount} recorded links
        </span>
        <Button
          aria-pressed={scope === 'all'}
          onClick={() => onScopeChange('all')}
          size="xs"
          variant="outline"
        >
          Entire study
        </Button>
        <Button
          aria-pressed={scope === 'linked'}
          disabled={!selectedEntry}
          onClick={() => onScopeChange('linked')}
          size="xs"
          variant="outline"
        >
          Selected and linked
        </Button>
      </div>
      <div
        ref={container}
        className="h-[max(26rem,calc(100dvh-14rem))] min-w-0 overflow-hidden rounded-md border bg-background"
      >
        <ReactFlow<EntryNode, Edge>
          key={focused ? `entry:${focused}` : 'study'}
          nodes={nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15, minZoom: 0.12, maxZoom: 1 }}
          minZoom={0.12}
          maxZoom={1.8}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <FitOnResize container={container} />
          <Background color="var(--border)" gap={24} size={1} />
          <Controls
            aria-label="Study graph controls"
            showInteractive={false}
            className="!border-border !shadow-none [&_button]:!border-border [&_button]:!bg-background [&_button]:!fill-foreground [&_button:hover]:!bg-muted"
          />
        </ReactFlow>
      </div>
    </section>
  );
}

/** Refit on pane resize without resetting zoom for ordinary selection updates. */
function FitOnResize({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void fitView({ padding: 0.15, maxZoom: 1, minZoom: 0.12 });
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [container, fitView]);
  return null;
}

function EntryCard({ data }: NodeProps<EntryNode>) {
  const { entry } = data;
  const kind = entry.members
    ? 'Observations'
    : (ENTRY_TYPE_LABELS[entry.kind as keyof typeof ENTRY_TYPE_LABELS] ?? 'Entry');
  return (
    <div className="relative" style={{ width, height }}>
      <Handle
        className="!size-0 !min-h-0 !min-w-0 !border-0 !opacity-0"
        position={Position.Bottom}
        type="target"
      />
      <button
        aria-label={`${kind}: ${entry.title}, ${entry.state.label}`}
        aria-pressed={data.selected}
        className={cn(
          'nodrag nopan flex h-full w-full flex-col gap-2 rounded-md border bg-card p-3 text-left shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
          data.selected && 'border-primary ring-2 ring-primary/30',
          entry.missing && 'border-dashed',
        )}
        disabled={entry.missing}
        onClick={() => data.onSelect(entry.id)}
        title={entry.title}
        type="button"
      >
        <span className="flex w-full items-center justify-between gap-2 text-xs font-medium">
          <span>{kind}</span>
          <ScienceStateChip state={entry.state} />
        </span>
        <span className="line-clamp-2 text-sm leading-5">{entry.title}</span>
        <span className="mt-auto w-full truncate text-[11px] text-muted-foreground">
          {entry.branch || entry.id}
        </span>
      </button>
      <Handle
        className="!size-0 !min-h-0 !min-w-0 !border-0 !opacity-0"
        position={Position.Top}
        type="source"
      />
    </div>
  );
}

function layoutStudyGraph(model: StudyGraphModel): { nodes: PositionedEntry[]; edges: Edge[] } {
  // Citation arrows point back to their sources. Bottom-to-top layout puts the
  // question above the later evidence without reversing any recorded relation.
  const dag = new graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}));
  dag.setGraph({ rankdir: 'BT', nodesep: 36, ranksep: 64, marginx: 24, marginy: 24 });
  for (const node of model.nodes) dag.setNode(node.id, { width, height });
  for (const edge of model.edges) dag.setEdge(edge.source, edge.target, {}, edge.id);
  layout(dag);
  return {
    nodes: model.nodes.map((entry) => {
      const position = dag.node(entry.id);
      return {
        id: entry.id,
        type: 'science-entry',
        position: { x: position.x - width / 2, y: position.y - height / 2 },
        style: { width, height },
        entry,
      };
    }),
    edges: model.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.count && edge.count > 1 ? `${edge.relation} (${edge.count})` : edge.relation,
      data: { count: edge.count ?? 1 },
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--primary)', width: 18, height: 18 },
      style: { stroke: 'var(--primary)', strokeWidth: 1.5 },
      labelStyle: { fill: 'var(--foreground)', fontSize: 11 },
      labelBgStyle: { fill: 'var(--background)', fillOpacity: 1 },
      labelBgPadding: [5, 3],
    })),
  };
}
