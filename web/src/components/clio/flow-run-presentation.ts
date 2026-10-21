import type { FlowRun, PlanNode, PlanView } from '@clio/core/v3';
import { graphlib, layout } from '@dagrejs/dagre';
import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';
import type { ClioStatusValue } from './status';

/** A run's overall state with its text label: running, completed, or the typed outcome. */
export function flowRunStatus(run: Pick<FlowRun, 'status' | 'outcome'>): {
  value: ClioStatusValue;
  label: string;
} {
  if (run.status === 'running') return { value: 'running', label: 'Running' };
  if (run.status === 'completed') return { value: 'completed', label: 'Completed' };
  if (run.status === 'flow_stall') return { value: 'failed', label: 'Stalled' };
  if (run.status === 'task_state_uncertain')
    return { value: 'task_state_uncertain', label: 'Needs inspection' };
  if (run.status === 'cancelled') return { value: 'cancelled', label: 'Cancelled' };
  return { value: 'failed', label: `Stopped: ${run.status.replaceAll('_', ' ')}` };
}

/** Width and height of one drawn plan node. Unit: CSS pixels. */
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 96;

export interface PlanNodeData extends Record<string, unknown> {
  id: string;
  target: string;
  status: ClioStatusValue;
  statusLabel: string;
  proposed: boolean;
  handle?: string;
  direction: 'LR' | 'TB';
  open?: (handle: string) => void;
}

export type PlanGraphNode = Node<PlanNodeData, 'clio-plan-node'>;

/** A plan node's state, always with its text label (never color alone). */
export function planNodeStatus(node: Pick<PlanNode, 'status'>): {
  value: ClioStatusValue;
  label: string;
} {
  switch (node.status) {
    case 'pending':
      return { value: 'queued', label: 'Waiting' };
    case 'running':
      return { value: 'running', label: 'Running' };
    case 'completed':
      return { value: 'completed', label: 'Completed' };
    case 'failed':
      return { value: 'failed', label: 'Failed' };
    case 'cancelled':
      return { value: 'cancelled', label: 'Cancelled' };
    case 'repaired':
      return { value: 'recovering', label: 'Repaired' };
    default:
      return { value: 'unknown', label: 'State not recognized' };
  }
}

/**
 * Lay out a plan: one node per plan node, an edge per dependency, and each
 * proposal awaiting approval drawn as a pending node hanging off what it waits on.
 */
export function buildPlanGraph(
  view: PlanView,
  direction: 'LR' | 'TB',
): { nodes: PlanGraphNode[]; edges: Edge[] } {
  const nodes: PlanGraphNode[] = [
    ...view.nodes.map((node): PlanGraphNode => {
      const status = planNodeStatus(node);
      return {
        id: node.id,
        type: 'clio-plan-node',
        position: { x: 0, y: 0 },
        data: {
          id: node.id,
          target: node.target,
          status: status.value,
          statusLabel: status.label,
          proposed: false,
          handle: node.handle || undefined,
          direction,
        },
        ariaLabel: `${node.id}, ${node.target}, ${status.label}`,
      };
    }),
    ...view.awaiting_approval
      .filter((proposal) => !view.nodes.some((node) => node.id === proposal.id))
      .map(
        (proposal): PlanGraphNode => ({
          id: proposal.id,
          type: 'clio-plan-node',
          position: { x: 0, y: 0 },
          data: {
            id: proposal.id,
            target: proposal.target,
            status: 'waiting_user',
            statusLabel: 'Awaiting approval',
            proposed: true,
            direction,
          },
          ariaLabel: `${proposal.id}, proposed by ${proposal.by || 'an editor'}, awaiting approval`,
        }),
      ),
  ];
  const known = new Set(nodes.map((node) => node.id));
  const dependencies = [
    ...view.nodes.map((node) => ({ id: node.id, after: node.after, proposed: false })),
    ...view.awaiting_approval.map((row) => ({ id: row.id, after: row.after, proposed: true })),
  ];
  const edges: Edge[] = dependencies.flatMap(({ id, after, proposed }) =>
    after
      .filter((source) => known.has(source))
      .map((source) => ({
        id: `${source}->${id}`,
        source,
        target: id,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: proposed ? { strokeDasharray: '4 4' } : undefined,
      })),
  );
  const graph = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 20, ranksep: 54, marginx: 18, marginy: 18 });
  for (const node of nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  layout(graph);
  const sourcePosition = direction === 'LR' ? Position.Right : Position.Bottom;
  const targetPosition = direction === 'LR' ? Position.Left : Position.Top;
  return {
    nodes: nodes.map((node) => {
      const position = graph.node(node.id);
      return {
        ...node,
        sourcePosition,
        targetPosition,
        position: { x: position.x - NODE_WIDTH / 2, y: position.y - NODE_HEIGHT / 2 },
      };
    }),
    edges,
  };
}
