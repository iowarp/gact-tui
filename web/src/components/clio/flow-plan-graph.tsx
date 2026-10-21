import type { PlanView } from '@clio/core/v3';
import { Controls, Handle, Position, ReactFlow, type Edge, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo, useRef } from 'react';
import { useContainerQuery } from '@/hooks/use-container-query';
import { cn } from '@/lib/utils';
import { ClioStatus } from './status';
import { buildPlanGraph, NODE_HEIGHT, type PlanGraphNode } from './flow-run-presentation';

const nodeTypes = { 'clio-plan-node': PlanNodeCard };

/** The live plan as a dependency graph; the node list beside it carries the same facts as text. */
export function FlowPlanGraph({
  view,
  onOpenHandle,
}: {
  view: PlanView;
  onOpenHandle: (handle: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontal = useContainerQuery(containerRef, 560);
  const direction = horizontal ? 'LR' : 'TB';
  const graph = useMemo(() => {
    const next = buildPlanGraph(view, direction);
    return {
      ...next,
      nodes: next.nodes.map((node) => ({ ...node, data: { ...node.data, open: onOpenHandle } })),
    };
  }, [direction, onOpenHandle, view]);
  const depth = Math.max(1, graph.nodes.length);
  const height = Math.min(560, Math.max(240, (horizontal ? 2 : depth) * (NODE_HEIGHT + 40) + 60));
  return (
    <div
      aria-label={`Plan graph with ${graph.nodes.length} nodes`}
      className="min-h-60 overflow-hidden rounded-lg border bg-background/55"
      ref={containerRef}
      role="img"
      style={{ height }}
    >
      <ReactFlow<PlanGraphNode, Edge>
        edges={graph.edges}
        elementsSelectable
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.16 }}
        maxZoom={1.5}
        minZoom={0.25}
        nodeTypes={nodeTypes}
        nodes={graph.nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        panOnDrag
        proOptions={{ hideAttribution: true }}
        zoomOnDoubleClick={false}
      >
        <Controls aria-label="Plan graph controls" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function PlanNodeCard({ data }: NodeProps<PlanGraphNode>) {
  const targetPosition = data.direction === 'TB' ? Position.Top : Position.Left;
  const sourcePosition = data.direction === 'TB' ? Position.Bottom : Position.Right;
  return (
    <div
      className={cn(
        'w-[200px] rounded-lg border bg-background px-3 py-2 shadow-sm',
        data.proposed && 'border-dashed',
      )}
    >
      <Handle
        className="!size-0 !border-0 !bg-transparent"
        position={targetPosition}
        type="target"
      />
      <p className="truncate text-sm font-medium">{data.id}</p>
      <p className="truncate text-[11px] text-muted-foreground">{data.target}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <ClioStatus className="py-0.5" label={data.statusLabel} value={data.status} />
        {data.handle && data.open ? (
          <button
            className="nodrag nopan text-[11px] text-primary underline-offset-2 hover:underline focus-visible:outline-ring"
            onClick={() => data.open?.(data.handle!)}
            type="button"
          >
            Open
          </button>
        ) : null}
      </div>
      <Handle
        className="!size-0 !border-0 !bg-transparent"
        position={sourcePosition}
        type="source"
      />
    </div>
  );
}
