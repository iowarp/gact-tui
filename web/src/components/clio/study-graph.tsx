import type { ScienceEntry } from '@clio/core/v3';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { EntryKindIcon, ScienceStatus } from './science-log-icons';
import { ENTRY_TYPE_LABELS } from './science-log-model';
import { STUDY_GRAPH_NODE, type StudyGraphLayout } from './study-graph-layout';
import type { StudyGraphNode } from './study-graph-model';

interface EntryNodeData extends Record<string, unknown> {
  entry: StudyGraphNode;
  selected: boolean;
  onSelect: (id: string) => void;
}
type EntryNode = Node<EntryNodeData, 'science-entry'>;
const nodeTypes = { 'science-entry': EntryCard };
const { width, height } = STUDY_GRAPH_NODE;
const FIT = { padding: 0.15, minZoom: 0.12, maxZoom: 1 };

export interface StudyGraphProps {
  graph: StudyGraphLayout;
  selectedEntry?: string;
  onSelectEntry: (id: string) => void;
}

/** The study's recorded links, left to right from the question to its conclusions, full-bleed. */
export function StudyGraph({ graph, selectedEntry, onSelectEntry }: StudyGraphProps) {
  const container = useRef<HTMLDivElement>(null);
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
  return (
    <section
      aria-label="Study relationship graph"
      className="h-full min-h-0 min-w-0 overflow-hidden bg-background"
      ref={container}
    >
      <ReactFlow<EntryNode, Edge>
        key={graph.focused ? `entry:${graph.focused}` : 'study'}
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={FIT}
        minZoom={0.12}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <FitOnResize container={container} />
        <Background color="var(--border)" gap={16} size={1.2} variant={BackgroundVariant.Dots} />
        <Controls
          aria-label="Study graph controls"
          className="!m-3 !gap-0.5 !border-0 !bg-transparent !shadow-none [&_button]:!size-7 [&_button]:!rounded-md [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!fill-muted-foreground [&_button:hover]:!bg-hover [&_button:hover]:!fill-foreground"
          position="bottom-right"
          showInteractive={false}
        />
      </ReactFlow>
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
        void fitView(FIT);
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
        <span className="truncate text-[12.5px] leading-4 font-semibold">{entry.title}</span>
        <ScienceStatus className="justify-start" state={entry.state} />
      </button>
      <Handle className={HANDLE} position={Position.Left} type="source" />
    </div>
  );
}
