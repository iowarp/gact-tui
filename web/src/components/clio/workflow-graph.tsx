import type { AsyncProcess, SubagentRun } from '@clio/core/v3';
import { Controls, Handle, Position, ReactFlow, type Edge, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useContainerQuery } from '@/hooks/use-container-query';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import { subagentOpenTarget, SUBAGENT_OPEN_HINT } from './subagent-navigation';
import { buildWorkflowGraph, nodeHeight, type WorkflowNode } from './workflow-graph-builders';

const nodeTypes = { 'clio-workflow': WorkflowNodeCard };

export function ClioWorkflowGraph({
  processes,
  subagents,
  onOpenSubagent,
}: {
  processes: readonly AsyncProcess[];
  subagents: readonly SubagentRun[];
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalFanout = useContainerQuery(containerRef, 700);
  const direction = horizontalFanout ? 'LR' : 'TB';
  const graph = useMemo(() => {
    const next = buildWorkflowGraph(processes, subagents, direction);
    return {
      ...next,
      nodes: next.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          openSubagent:
            node.data.subagent && onOpenSubagent
              ? (target: SubagentOpenTarget) => onOpenSubagent(node.data.subagent!, target)
              : undefined,
        },
      })),
    };
  }, [direction, onOpenSubagent, processes, subagents]);
  const agentCount = processes.filter((process) => process.kind === 'agent').length;
  const graphHeight = horizontalFanout
    ? Math.min(720, Math.max(320, agentCount * (nodeHeight + 14) + 120))
    : Math.min(920, Math.max(360, agentCount * (nodeHeight + 14) + 120));

  if (!graph.edges.length) return null;

  return (
    <section className="min-w-0 space-y-2">
      <h3 className="text-sm font-medium">Delegation map</h3>
      <div
        aria-label="Child-agent delegation topology"
        className="min-h-72 overflow-hidden rounded-lg border bg-background/55"
        ref={containerRef}
        role="img"
        style={{ height: graphHeight }}
      >
        <ReactFlow<WorkflowNode, Edge>
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
          <Controls aria-label="Delegation map controls" showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="text-xs text-muted-foreground">
        Select a child to open a workspace tab. Shift-click opens the conversation in the center.
      </p>
    </section>
  );
}

function WorkflowNodeCard({ data }: NodeProps<WorkflowNode>) {
  const targetPosition = data.direction === 'TB' ? Position.Top : Position.Left;
  const sourcePosition = data.direction === 'TB' ? Position.Bottom : Position.Right;
  const content = (
    <>
      <p className="truncate text-sm font-medium">{data.label}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{data.detail}</p>
      <ClioStatus className="mt-2 py-0.5" value={data.state} />
    </>
  );
  return (
    <div className="w-[196px] rounded-lg border bg-background px-3 py-2 shadow-sm transition-colors hover:border-primary focus-within:border-primary">
      <Handle
        className="!size-0 !border-0 !bg-transparent"
        position={targetPosition}
        type="target"
      />
      {data.openSubagent ? (
        <>
          <button
            aria-label={`Open ${data.label} in a workspace tab`}
            className="nodrag nopan block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => data.openSubagent?.(subagentOpenTarget(event))}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              data.openSubagent?.(subagentOpenTarget(event));
            }}
            title={SUBAGENT_OPEN_HINT}
            type="button"
          >
            {content}
          </button>
          <Button
            className="nodrag nopan mt-1.5 h-5 w-full justify-start px-1.5 text-[10px]"
            onClick={() => data.openSubagent?.('canvas')}
            size="xs"
            variant="ghost"
          >
            Open in canvas →
          </Button>
        </>
      ) : (
        content
      )}
      <Handle
        className="!size-0 !border-0 !bg-transparent"
        position={sourcePosition}
        type="source"
      />
    </div>
  );
}
