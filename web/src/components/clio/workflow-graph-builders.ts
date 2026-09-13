import type {
  AsyncProcess,
  ExecutionProvenanceResult,
  RunState,
  SubagentRun,
  ToolInvocation,
} from '@clio/core/v3';
import { graphlib, layout } from '@dagrejs/dagre';
import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';
import { formatDuration, formatNestingDepth } from '@/lib/format';
import type { SubagentOpenTarget } from './subagent-card';
import { workflowDescriptor } from './workflow-tool-presentation';

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  detail: string;
  state: RunState;
  subagent?: SubagentRun;
  direction?: 'LR' | 'TB';
  openSubagent?: (target: SubagentOpenTarget) => void;
}

export interface ExecutionNodeData extends Record<string, unknown> {
  label: string;
  detail: string;
  status: string;
  missing?: boolean;
  width: number;
  direction: 'LR' | 'TB';
  ownerSessionId?: string;
  taskId?: string;
  depth?: number;
  openSubagent?: (target: SubagentOpenTarget) => void;
}

export type WorkflowNode = Node<WorkflowNodeData, 'clio-workflow'>;
export type ExecutionNode = Node<ExecutionNodeData, 'clio-execution'>;

export const nodeWidth = 196;
export const nodeHeight = 108;

export function initialExecutionViewport(
  nodes: readonly Node<ExecutionNodeData, 'clio-execution'>[],
  provenance: Pick<ExecutionProvenanceResult, 'root_session_id' | 'session_id'>,
  direction: 'LR' | 'TB',
): {
  fitView: boolean;
  isReadableDetail: boolean;
  viewport: { x: number; y: number; zoom: number };
} {
  if (nodes.length <= 24) {
    return { fitView: true, isReadableDetail: false, viewport: { x: 0, y: 0, zoom: 1 } };
  }

  const rootSessionId = provenance.root_session_id || provenance.session_id;
  const start =
    nodes.find((node) => node.id === `session:${rootSessionId}`) ??
    nodes.find((node) => node.data.detail.startsWith('session')) ??
    nodes[0];
  const zoom = direction === 'LR' ? 0.82 : 0.76;
  return {
    fitView: false,
    isReadableDetail: true,
    viewport: {
      x: 20 - (start?.position.x ?? 0) * zoom,
      y: 20 - (start?.position.y ?? 0) * zoom,
      zoom,
    },
  };
}

// Pure construction preserves every service-reported relationship and exposes broken references.
export function buildExecutionProvenanceGraph(
  provenance: ExecutionProvenanceResult,
  direction: 'LR' | 'TB',
): { nodes: Node<ExecutionNodeData, 'clio-execution'>[]; edges: Edge[] } {
  const serviceNodes = new Map(provenance.nodes.map((node) => [node.id, node]));
  const referencedIds = new Set(provenance.edges.flatMap((edge) => [edge.source, edge.target]));
  const missingIds = [...referencedIds].filter((id) => !serviceNodes.has(id));
  const lineageBySession = new Map(
    provenance.session_lineage?.map((owner) => [owner.session_id, owner]) ?? [],
  );
  const nodes: ExecutionNode[] = [
    ...provenance.nodes.map((node) => {
      const label = executionNodeLabel(node);
      const width = executionNodeWidth(label);
      const ownerSessionId =
        stringAttribute(node.attributes, 'owner_session_id') || node.session_id;
      const owner = lineageBySession.get(ownerSessionId);
      const taskId = stringAttribute(node.attributes, 'task_id') || owner?.task_id;
      const depth = numberAttribute(node.attributes, 'depth') ?? owner?.depth;
      return {
        id: node.id,
        type: 'clio-execution' as const,
        position: { x: 0, y: 0 },
        data: {
          label,
          detail: [
            toolInputDetail(node.attributes),
            node.kind,
            owner?.label || node.agent_id,
            depth === undefined ? undefined : formatNestingDepth(depth),
          ]
            .filter(Boolean)
            .join(', '),
          status: node.status,
          width,
          direction,
          ownerSessionId,
          taskId,
          depth,
        },
        ariaLabel: `${label}, ${node.kind}, ${node.status}`,
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

export function executionNodeWidth(label: string): number {
  return Math.min(320, Math.max(196, 112 + label.length * 7));
}

export function statusValue(status: string): 'healthy' | 'degraded' | 'unavailable' | RunState {
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
            (process.owner_session_id || process.child_session_id) &&
              candidate.child_session_id === (process.owner_session_id || process.child_session_id),
          ),
      );
      const depth = process.task_path?.length || process.depth;
      const detail = [
        depth === undefined ? undefined : `Depth ${depth}`,
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
  const processByTask = new Map(agents.map((process) => [process.id, process]));
  const processByChildSession = new Map(
    agents
      .filter((process) => process.owner_session_id || process.child_session_id)
      .map((process) => [process.owner_session_id ?? process.child_session_id!, process]),
  );
  const edges: Edge[] = agents.map((process) => {
    const parentTaskId = process.task_path?.at(-2);
    const parentProcess =
      (parentTaskId ? processByTask.get(parentTaskId) : undefined) ??
      (process.parent_session_id
        ? processByChildSession.get(process.parent_session_id)
        : undefined);
    const source = parentProcess?.id ?? 'session-root';
    return {
      id: `${source}:${process.id}`,
      source,
      target: process.id,
      type: 'smoothstep',
    };
  });

  return layoutGraph(nodes, edges, direction);
}

/** Build the ordered graph declared by a recorded run_workflow result. */
export function buildWorkflowExecutionGraph(
  tool: ToolInvocation,
  subagents: readonly SubagentRun[],
  direction: 'LR' | 'TB',
): { nodes: WorkflowNode[]; edges: Edge[] } {
  const descriptor = workflowDescriptor(tool);
  if (!descriptor) return { nodes: [], edges: [] };
  const workflowState = toolStateAsRunState(tool.state);
  const nodes: WorkflowNode[] = [
    {
      id: `workflow:${tool.id}`,
      type: 'clio-workflow',
      position: { x: 0, y: 0 },
      data: {
        label: descriptor.label,
        detail: `${descriptor.steps.length} ordered ${descriptor.steps.length === 1 ? 'step' : 'steps'}`,
        state: workflowState,
      },
      ariaLabel: `${descriptor.label}, workflow, ${workflowState}`,
    },
    ...descriptor.steps.map((step, index): WorkflowNode => {
      const subagent = subagents.find((candidate) => candidate.id === step.taskId);
      const state = subagent?.state ?? workflowState;
      const detail = [
        `Step ${index + 1} of ${descriptor.steps.length}`,
        subagent?.duration_ms !== undefined ? formatDuration(subagent.duration_ms) : undefined,
      ]
        .filter(Boolean)
        .join(', ');
      return {
        id: step.taskId ? `workflow-step:${step.taskId}` : `workflow-step:${tool.id}:${index}`,
        type: 'clio-workflow',
        position: { x: 0, y: 0 },
        data: { label: step.name, detail, state, subagent },
        ariaLabel: `${step.name}, ${detail}, ${state}`,
      };
    }),
  ];
  const edges = descriptor.steps.map((step, index): Edge => {
    const target = step.taskId
      ? `workflow-step:${step.taskId}`
      : `workflow-step:${tool.id}:${index}`;
    const previous = descriptor.steps[index - 1];
    const source =
      index === 0
        ? `workflow:${tool.id}`
        : previous.taskId
          ? `workflow-step:${previous.taskId}`
          : `workflow-step:${tool.id}:${index - 1}`;
    return {
      id: `workflow-order:${source}->${target}`,
      source,
      target,
      label: index === 0 ? 'starts' : 'then',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
    };
  });
  return layoutGraph(nodes, edges, direction);
}

export function toolStateAsRunState(state: ToolInvocation['state']): RunState {
  if (state === 'pending') return 'queued';
  if (state === 'running') return 'running';
  if (state === 'succeeded') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'cancelled' || state === 'denied') return 'cancelled';
  return 'unknown';
}

export function stringAttribute(attributes: Record<string, unknown>, key: string): string {
  const value = attributes[key];
  return typeof value === 'string' ? value : '';
}

export function executionNodeLabel(node: ExecutionProvenanceResult['nodes'][number]): string {
  const toolName = stringAttribute(node.attributes, 'tool_name');
  if (!toolName) return node.label;
  const titles: Record<string, string> = {
    create_artifact: 'Create artifact',
    get_agent_task_output: 'Read agent result',
    spawn_agent_task: 'Start agent',
    spawn_agents_parallel: 'Start agents',
    submit: 'Submit result',
    wait_agent_tasks: 'Wait for agents',
    web_fetch: 'Fetch target',
    web_search: 'Search web',
    workspace_resource_inspect: 'Inspect resource',
    workspace_resource_read: 'Read resource',
    workspace_resource_search: 'Search resource',
    workspace_resource_structure: 'Read resource structure',
  };
  return titles[toolName] ?? toolName.replaceAll('_', ' ');
}

export function toolInputDetail(attributes: Record<string, unknown>): string {
  const input = attributes.tool_input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const values = input as Record<string, unknown>;
  for (const key of ['target', 'query', 'resource_id']) {
    const value = values[key];
    if (typeof value === 'string' && value) return value;
  }
  return '';
}

export function numberAttribute(attributes: Record<string, unknown>, key: string): number | undefined {
  const value = attributes[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function layoutGraph(
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

export function summarizeState(states: readonly RunState[]): RunState {
  if (states.some((state) => state === 'running')) return 'running';
  if (states.some((state) => state === 'queued')) return 'queued';
  if (states.some((state) => state === 'waiting_permission')) return 'waiting_permission';
  if (states.some((state) => state === 'waiting_user')) return 'waiting_user';
  if (states.some((state) => state === 'failed')) return 'failed';
  if (states.some((state) => state === 'interrupted')) return 'interrupted';
  if (states.some((state) => state === 'cancelled')) return 'cancelled';
  return 'completed';
}

export function formatElapsed(start?: string, end?: string): string | undefined {
  if (!start || !end) return undefined;
  const elapsed = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(elapsed) || elapsed < 0) return undefined;
  return formatDuration(elapsed, 'compact');
}

