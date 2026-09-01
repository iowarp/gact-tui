import type { AsyncProcess, ExecutionProvenanceResult, RunState, SubagentRun } from '@clio/core/v3';
import { graphlib, layout } from '@dagrejs/dagre';
import {
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NetworkIcon } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { useContainerQuery } from '@/hooks/use-container-query';
import { formatDuration } from '@/lib/format';
import { ClioStatus } from './status';
import type { SubagentOpenTarget } from './subagent-card';

interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  detail: string;
  state: RunState;
  subagent?: SubagentRun;
  direction?: 'LR' | 'TB';
  openSubagent?: (target: SubagentOpenTarget) => void;
}

interface ExecutionNodeData extends Record<string, unknown> {
  label: string;
  detail: string;
  status: string;
  missing?: boolean;
  width: number;
  direction: 'LR' | 'TB';
}

type WorkflowNode = Node<WorkflowNodeData, 'clio-workflow'>;

const nodeTypes = { 'clio-workflow': WorkflowNodeCard };
const executionNodeTypes = { 'clio-execution': ExecutionNodeCard };
const nodeWidth = 196;
const nodeHeight = 108;

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
    <Frame spacing="sm" variant="ghost">
      <FrameHeader>
        <div className="flex items-start gap-3">
          <NetworkIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
          <div>
            <FrameTitle>Delegation map</FrameTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Select a child to open its conversation. Shift-click keeps the parent here and opens
              the child in the canvas.
            </p>
          </div>
        </div>
      </FrameHeader>
      <FramePanel>
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
      </FramePanel>
    </Frame>
  );
}

/** Provider-neutral execution graph rendered directly from CLIO's normalized provenance model. */
export function ClioExecutionProvenanceGraph({
  provenance,
}: {
  provenance: ExecutionProvenanceResult;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontal = useContainerQuery(containerRef, 560);
  const graph = useMemo(
    () => buildExecutionProvenanceGraph(provenance, horizontal ? 'LR' : 'TB'),
    [horizontal, provenance],
  );
  const height = Math.min(760, Math.max(300, graph.nodes.length * (horizontal ? 42 : 72)));

  return (
    <Frame spacing="sm" variant="ghost">
      <FrameHeader>
        <div className="flex min-w-0 items-start gap-3">
          <NetworkIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <FrameTitle>Execution provenance</FrameTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {provenance.nodes.length.toLocaleString()} nodes and{' '}
              {provenance.edges.length.toLocaleString()} relationships reported by{' '}
              {provenance.provider}.
            </p>
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
            edges={graph.edges}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.18 }}
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

// Pure construction preserves every service-reported relationship and exposes broken references.
// oxlint-disable-next-line react/only-export-components
export function buildExecutionProvenanceGraph(
  provenance: ExecutionProvenanceResult,
  direction: 'LR' | 'TB',
): { nodes: Node<ExecutionNodeData, 'clio-execution'>[]; edges: Edge[] } {
  const serviceNodes = new Map(provenance.nodes.map((node) => [node.id, node]));
  const referencedIds = new Set(provenance.edges.flatMap((edge) => [edge.source, edge.target]));
  const missingIds = [...referencedIds].filter((id) => !serviceNodes.has(id));
  const nodes: Node<ExecutionNodeData, 'clio-execution'>[] = [
    ...provenance.nodes.map((node) => {
      const width = executionNodeWidth(node.label);
      return {
        id: node.id,
        type: 'clio-execution' as const,
        position: { x: 0, y: 0 },
        data: {
          label: node.label,
          detail: [node.kind, node.agent_id].filter(Boolean).join(', '),
          status: node.status,
          width,
          direction,
        },
        ariaLabel: `${node.label}, ${node.kind}, ${node.status}`,
        style: { width },
      };
    }),
    ...missingIds.map((id) => ({
      id,
      type: 'clio-execution' as const,
      position: { x: 0, y: 0 },
      data: {
        label: id,
        detail: 'Referenced node unavailable',
        status: 'unavailable',
        missing: true,
        width: 220,
        direction,
      },
      ariaLabel: `${id}, referenced node unavailable`,
      style: { width: 220 },
    })),
  ];
  const edges: Edge[] = provenance.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.kind,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
  return layoutExecutionGraph(nodes, edges, direction);
}

function layoutExecutionGraph(
  nodes: Node<ExecutionNodeData, 'clio-execution'>[],
  edges: Edge[],
  direction: 'LR' | 'TB',
) {
  const graph = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 30, ranksep: 86, marginx: 24, marginy: 24 });
  for (const node of nodes) graph.setNode(node.id, { width: node.data.width, height: 82 });
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  layout(graph);
  return {
    nodes: nodes.map((node) => {
      const position = graph.node(node.id);
      return {
        ...node,
        sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
        targetPosition: direction === 'LR' ? Position.Left : Position.Top,
        position: { x: position.x - node.data.width / 2, y: position.y - 41 },
      };
    }),
    edges,
  };
}

function ExecutionNodeCard({ data }: NodeProps<Node<ExecutionNodeData, 'clio-execution'>>) {
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
      <p className="truncate text-sm font-medium" title={data.label}>
        {data.label}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={data.detail}>
        {data.detail}
      </p>
      <ClioStatus className="mt-2 py-0.5" label={data.status || undefined} value={status} />
      <Handle
        className="!size-0 !border-0 !bg-transparent"
        position={data.direction === 'LR' ? Position.Right : Position.Bottom}
        type="source"
      />
    </div>
  );
}

function executionNodeWidth(label: string): number {
  return Math.min(320, Math.max(196, 112 + label.length * 7));
}

function statusValue(status: string): 'healthy' | 'degraded' | 'unavailable' | RunState {
  if (status === 'healthy' || status === 'ready') return 'healthy';
  if (status === 'degraded') return 'degraded';
  if (status === 'unavailable') return 'unavailable';
  if (
    [
      'queued',
      'running',
      'waiting_permission',
      'waiting_user',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
    ].includes(status)
  )
    return status as RunState;
  return 'unavailable';
}

// Pure graph construction is exported for deterministic layout tests; it owns no React state.
// oxlint-disable-next-line react/only-export-components
export function buildWorkflowGraph(
  processes: readonly AsyncProcess[],
  subagents: readonly SubagentRun[],
  direction: 'LR' | 'TB',
): { nodes: WorkflowNode[]; edges: Edge[] } {
  const agents = processes.filter((process) => process.kind === 'agent');
  if (!agents.length) return { nodes: [], edges: [] };

  const rootState = summarizeState(agents.map((process) => process.live_state));
  const delegatedDetail = `${agents.length} delegated ${agents.length === 1 ? 'run' : 'runs'}`;
  const nodes: WorkflowNode[] = [
    {
      id: 'session-root',
      type: 'clio-workflow',
      position: { x: 0, y: 0 },
      data: {
        label: 'Current session',
        detail: delegatedDetail,
        state: rootState,
      },
      ariaLabel: `Current session, ${delegatedDetail}, ${rootState}`,
    },
    ...agents.map((process): WorkflowNode => {
      const subagent = subagents.find(
        (candidate) =>
          candidate.id === process.id ||
          Boolean(
            process.child_session_id && candidate.child_session_id === process.child_session_id,
          ),
      );
      const detail = [
        process.depth === undefined ? undefined : `Depth ${process.depth}`,
        formatElapsed(process.created_at, process.updated_at),
      ]
        .filter(Boolean)
        .join(', ');
      return {
        id: process.id,
        type: 'clio-workflow',
        position: { x: 0, y: 0 },
        data: {
          label: process.title,
          detail: detail || 'Child agent',
          state: process.live_state,
          subagent,
        },
        ariaLabel: `${process.title}, ${detail || 'Child agent'}, ${process.live_state}`,
      };
    }),
  ];
  const edges: Edge[] = agents.map((process) => ({
    id: `session-root:${process.id}`,
    source: 'session-root',
    target: process.id,
    type: 'smoothstep',
  }));

  return layoutGraph(nodes, edges, direction);
}

function layoutGraph(
  nodes: WorkflowNode[],
  edges: Edge[],
  direction: 'LR' | 'TB',
): { nodes: WorkflowNode[]; edges: Edge[] } {
  const graph = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 20, ranksep: 54, marginx: 18, marginy: 18 });
  for (const node of nodes) graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  layout(graph);

  const sourcePosition = direction === 'LR' ? Position.Right : Position.Bottom;
  const targetPosition = direction === 'LR' ? Position.Left : Position.Top;
  return {
    nodes: nodes.map((node) => {
      const position = graph.node(node.id);
      return {
        ...node,
        data: { ...node.data, direction },
        sourcePosition,
        targetPosition,
        position: { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 },
      };
    }),
    edges,
  };
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
            aria-label={`Open ${data.label} conversation`}
            className="nodrag nopan block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => data.openSubagent?.(event.shiftKey ? 'canvas' : 'conversation')}
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

function summarizeState(states: readonly RunState[]): RunState {
  if (states.some((state) => state === 'running')) return 'running';
  if (states.some((state) => state === 'queued')) return 'queued';
  if (states.some((state) => state === 'waiting_permission')) return 'waiting_permission';
  if (states.some((state) => state === 'waiting_user')) return 'waiting_user';
  if (states.some((state) => state === 'failed')) return 'failed';
  if (states.some((state) => state === 'interrupted')) return 'interrupted';
  if (states.some((state) => state === 'cancelled')) return 'cancelled';
  return 'completed';
}

function formatElapsed(start?: string, end?: string): string | undefined {
  if (!start || !end) return undefined;
  const elapsed = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(elapsed) || elapsed < 0) return undefined;
  return formatDuration(elapsed, 'compact');
}
