import type { ExecutionProvenanceResult, SubagentRun } from '@clio/core/v3';
import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NetworkIcon } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { useContainerQuery } from '@/hooks/use-container-query';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import {
  buildExecutionProvenanceGraph,
  initialExecutionViewport,
  statusValue,
  type ExecutionNode,
} from './workflow-graph-builders';

const executionNodeTypes = { 'clio-execution': ExecutionNodeCard };

/** Provider-neutral execution graph rendered directly from CLIO's normalized provenance model. */
export function ClioExecutionProvenanceGraph({
  provenance,
  subagents = [],
  onOpenSubagent,
  title = 'Execution provenance',
  description,
}: {
  provenance: ExecutionProvenanceResult;
  subagents?: readonly SubagentRun[];
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  title?: string;
  description?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontal = useContainerQuery(containerRef, 560);
  const graph = useMemo(() => {
    const next = buildExecutionProvenanceGraph(provenance, horizontal ? 'LR' : 'TB');
    return {
      ...next,
      nodes: next.nodes.map((node) => {
        const subagent = subagents.find(
          (candidate) =>
            Boolean(node.data.taskId && candidate.id === node.data.taskId) ||
            Boolean(
              node.data.ownerSessionId && candidate.child_session_id === node.data.ownerSessionId,
            ),
        );
        return {
          ...node,
          data: {
            ...node.data,
            openSubagent:
              subagent && onOpenSubagent
                ? (target: SubagentOpenTarget) => onOpenSubagent(subagent, target)
                : undefined,
          },
        };
      }),
    };
  }, [horizontal, onOpenSubagent, provenance, subagents]);
  const height = Math.min(760, Math.max(300, graph.nodes.length * (horizontal ? 42 : 72)));
  const initialView = initialExecutionViewport(graph.nodes, provenance, horizontal ? 'LR' : 'TB');

  return (
    <Frame spacing="sm" variant="ghost">
      <FrameHeader>
        <div className="flex min-w-0 items-start gap-3">
          <NetworkIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <FrameTitle>{title}</FrameTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description ??
                `${provenance.nodes.length.toLocaleString()} nodes and ${provenance.edges.length.toLocaleString()} relationships reported by ${provenance.provider}.`}
            </p>
            {initialView.isReadableDetail ? (
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                Opened at readable detail. Pan to follow the research path, or use Fit view for the
                complete map.
              </p>
            ) : null}
          </div>
        </div>
      </FrameHeader>
      <FramePanel>
        <div
          aria-label={`${provenance.provider} execution provenance graph`}
          className="min-h-72 overflow-hidden rounded-lg border bg-background/55"
          ref={containerRef}
          role="img"
          style={{ height }}
        >
          <ReactFlow
            defaultViewport={initialView.viewport}
            edges={graph.edges}
            fitView={initialView.fitView}
            fitViewOptions={{ maxZoom: 1, padding: 0.18 }}
            key={`${provenance.session_id}:${horizontal ? 'wide' : 'narrow'}:${graph.nodes.length}`}
            maxZoom={1.75}
            minZoom={0.12}
            nodeTypes={executionNodeTypes}
            nodes={graph.nodes}
            nodesConnectable={false}
            nodesDraggable={false}
            panOnDrag
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={false}
          >
            <Controls aria-label="Execution provenance graph controls" showInteractive={false} />
          </ReactFlow>
        </div>
      </FramePanel>
    </Frame>
  );
}

/** Keep dense provenance readable on first paint while retaining Fit view as an explicit overview. */
function ExecutionNodeCard({ data }: NodeProps<ExecutionNode>) {
  const status = statusValue(data.status);
  return (
    <div
      className={`rounded-lg border bg-background px-3 py-2 shadow-sm ${
        data.missing ? 'border-warning border-dashed' : 'hover:border-primary'
      }`}
      style={{ width: data.width }}
    >
      <Handle
        className="!size-0 !border-0 !bg-transparent"
        position={data.direction === 'LR' ? Position.Left : Position.Top}
        type="target"
      />
      {data.openSubagent ? (
        <>
          <Button
            aria-label={`Open ${data.label} conversation`}
            className="nodrag nopan h-auto w-full justify-start px-0 py-0 text-left"
            onClick={(event) => data.openSubagent?.(event.shiftKey ? 'canvas' : 'conversation')}
            type="button"
            variant="ghost"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium" title={data.label}>
                {data.label}
              </span>
              <span
                className="mt-0.5 block truncate text-[10px] text-muted-foreground"
                title={data.detail}
              >
                {data.detail}
              </span>
            </span>
          </Button>
          <Button
            className="nodrag nopan mt-1 h-5 w-full justify-start px-1.5 text-[10px]"
            onClick={() => data.openSubagent?.('canvas')}
            size="xs"
            type="button"
            variant="ghost"
          >
            Open in canvas →
          </Button>
        </>
      ) : (
        <>
          <p className="truncate text-sm font-medium" title={data.label}>
            {data.label}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={data.detail}>
            {data.detail}
          </p>
        </>
      )}
      <ClioStatus className="mt-2 py-0.5" label={data.status || undefined} value={status} />
      <Handle
        className="!size-0 !border-0 !bg-transparent"
        position={data.direction === 'LR' ? Position.Right : Position.Bottom}
        type="source"
      />
    </div>
  );
}

