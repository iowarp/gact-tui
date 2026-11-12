import type { ScienceEntry } from '@clio/core/v3';
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { EntryKindIcon, ScienceStatus } from './science-log-icons';
import { ENTRY_TYPE_LABELS } from './science-log-model';
import { ApplyViewport, GraphControls } from './graph-controls';
import { fitColumns, fitHeight, topLeftViewport, usePaneSize } from './graph-fit';
import { GraphEdgeFade } from './graph-edge-fade';
import {
  STUDY_GRAPH_NODE,
  studyGraphColumns,
  withColumnGap,
  type StudyGraphLayout,
} from './study-graph-layout';
import type { StudyGraphNode } from './study-graph-model';

interface EntryNodeData extends Record<string, unknown> {
  entry: StudyGraphNode;
  selected: boolean;
  onSelect: (id: string) => void;
}
type EntryNode = Node<EntryNodeData, 'science-entry'>;
const nodeTypes = { 'science-entry': EntryCard };
const { width, height } = STUDY_GRAPH_NODE;
/** Opens readable: an 11.5px title at no less than 10px, top-left, the rest a pan away. */
const OPEN_FLOOR = 10 / 11.5;
/** Fit (the controls' frame button) zooms out this far so the whole study is in view. */
const FIT_FLOOR = 0.12;

export interface StudyGraphProps {
  graph: StudyGraphLayout;
  selectedEntry?: string;
  onSelectEntry: (id: string) => void;
}

/**
 * The study's recorded links, left to right from the question to its conclusions,
 * full-bleed and laid out from the top-left. The column gap and then the scale
 * shrink toward the pane, but never below a readable title; an edge fade and chevron
 * show where the study continues, and Fit in the controls brings all of it into view.
 */
export function StudyGraph({ graph, selectedEntry, onSelectEntry }: StudyGraphProps) {
  const container = useRef<HTMLDivElement>(null);
  const size = usePaneSize(container);
  const fit = fitColumns(size?.w, studyGraphColumns(graph.nodes), width, OPEN_FLOOR);
  const placed = withColumnGap(graph.nodes, fit.gap);
  const wide = placed.length ? Math.max(...placed.map((node) => node.position.x)) + width : 0;
  const tall = placed.length ? Math.max(...placed.map((node) => node.position.y)) + height : 0;
  const nodes: EntryNode[] = placed.map(({ entry, ...node }) => ({
    ...node,
    data: {
      entry,
      selected:
        node.id === selectedEntry ||
        Boolean(selectedEntry && entry.members?.includes(selectedEntry)),
      onSelect: onSelectEntry,
    },
  }));
  const viewport = topLeftViewport(fitHeight(fit, size?.h, tall, OPEN_FLOOR));
  return (
    <section
      aria-label="Study relationship graph"
      className="h-full min-h-0 min-w-0 overflow-hidden bg-background"
      ref={container}
    >
      <ReactFlow<EntryNode, Edge>
        key={graph.focused ? `entry:${graph.focused}` : 'study'}
        defaultViewport={viewport}
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        minZoom={FIT_FLOOR}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <ApplyViewport viewport={viewport} />
        <GraphEdgeFade width={wide} height={tall} />
        <Background color="var(--border)" gap={16} size={1.2} variant={BackgroundVariant.Dots} />
        <GraphControls label="Study graph controls" region={container} />
      </ReactFlow>
    </section>
  );
}

const HANDLE = '!size-0 !min-h-0 !min-w-0 !border-0 !opacity-0';

function EntryCard({ data }: NodeProps<EntryNode>) {
  const { entry } = data;
  const type: ScienceEntry['type'] = entry.members
    ? 'observation'
    : entry.kind in ENTRY_TYPE_LABELS
      ? (entry.kind as ScienceEntry['type'])
      : 'unknown';
  const kind = entry.members ? 'Observations' : ENTRY_TYPE_LABELS[type];
  return (
    <div className="relative" style={{ width, height }}>
      <Handle className={HANDLE} position={Position.Right} type="target" />
      <button
        aria-label={`${kind}: ${entry.title}, ${entry.state.label}`}
        aria-pressed={data.selected}
        className={cn(
          'nodrag nopan grid h-full w-full grid-cols-[14px_minmax(0,1fr)] content-center gap-x-2 rounded-md border bg-card px-2.5 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
          entry.state.tone === 'refuted' && 'border-dashed border-destructive/60',
          entry.missing && 'border-dashed text-muted-foreground',
          data.selected && 'border-primary ring-1 ring-primary',
        )}
        disabled={entry.missing}
        onClick={() => data.onSelect(entry.id)}
        title={`${kind}: ${entry.title}${entry.branch ? ` (${entry.branch})` : ''}`}
        type="button"
      >
        <EntryKindIcon className="row-span-2 text-muted-foreground" type={type} />
        {/* The whole recorded title, on two lines if it must: never cut to "Drought, n…". */}
        <span className="line-clamp-2 text-label leading-[13px] font-semibold break-words">
          {entry.title}
        </span>
        <ScienceStatus className="justify-start text-[10.5px] leading-3" state={entry.state} />
      </button>
      <Handle className={HANDLE} position={Position.Left} type="source" />
    </div>
  );
}
