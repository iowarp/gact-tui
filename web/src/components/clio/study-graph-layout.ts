import type { ScienceStudy } from '@clio/core/v3';
import { graphlib, layout } from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { useMemo } from 'react';
import { GRAPH_ARROW, GRAPH_EDGE_STYLE, GRAPH_GAP } from './graph-fit';
import {
  studyGraph,
  studyGraphNeighborhood,
  studyGraphOverview,
  type StudyGraphModel,
  type StudyGraphNode,
} from './study-graph-model';

/** Each drawn entry's box, in graph units: the spec's 120 x 40 card. */
export const STUDY_GRAPH_NODE = { width: 120, height: 40 };
const { width, height } = STUDY_GRAPH_NODE;

type PositionedEntry = Pick<Node, 'id' | 'position' | 'style'> & {
  type: 'science-entry';
  entry: StudyGraphNode;
};

export type StudyGraphScope = 'all' | 'linked';

export interface StudyGraphLayout {
  /** Whether the study has any entry to draw. */
  empty: boolean;
  /** The entry the drawing is narrowed to, when the scope is the selection's links. */
  focused?: string;
  nodes: PositionedEntry[];
  edges: Edge[];
  /** Entries drawn, counting each grouped observation. */
  entryCount: number;
  /** Recorded links drawn, counting each grouped link. */
  linkCount: number;
}

/**
 * The study graph's drawing: the whole study (an experiment's observations as one
 * node) or the selected entry with its direct links. The frame reads the counts.
 */
export function useStudyGraphLayout(
  study: ScienceStudy,
  selectedEntry: string | undefined,
  scope: StudyGraphScope,
  enabled = true,
): StudyGraphLayout | undefined {
  const model = useMemo(() => (enabled ? studyGraph(study) : undefined), [study, enabled]);
  const overview = useMemo(
    () => (model ? studyGraphOverview(study, model) : undefined),
    [study, model],
  );
  const focused = scope === 'linked' && selectedEntry ? selectedEntry : undefined;
  return useMemo(() => {
    if (!model || !overview) return undefined;
    const source = focused?.startsWith('group:') ? overview : model;
    const graph = layoutStudyGraph(focused ? studyGraphNeighborhood(source, focused) : overview);
    return {
      empty: !model.nodes.length,
      ...(focused ? { focused } : {}),
      ...graph,
      entryCount: graph.nodes.reduce((total, { entry }) => total + (entry.members?.length ?? 1), 0),
      linkCount: graph.edges.reduce(
        (total, edge) => total + Number((edge.data as { count?: number } | undefined)?.count ?? 1),
        0,
      ),
    };
  }, [model, overview, focused]);
}

function layoutStudyGraph(model: StudyGraphModel): Pick<StudyGraphLayout, 'nodes' | 'edges'> {
  // Links run from the citing entry to the cited one. Right-to-left ranks put the
  // question on the left and what cites it to its right; the arrow is drawn at the
  // citing end so the study reads left to right without reversing any relation.
  const dag = new graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}));
  // The narrowest gap; the drawing widens it to fit the pane (`withColumnGap`).
  dag.setGraph({ rankdir: 'RL', nodesep: 24, ranksep: GRAPH_GAP.min, marginx: 0, marginy: 0 });
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
      ariaLabel: edge.count && edge.count > 1 ? `${edge.relation} (${edge.count})` : edge.relation,
      data: { count: edge.count ?? 1 },
      markerStart: GRAPH_ARROW,
      style: GRAPH_EDGE_STYLE,
    })),
  };
}

/** How many columns (ranks) the drawing has. */
export function studyGraphColumns(nodes: readonly Pick<Node, 'position'>[]): number {
  return new Set(nodes.map((node) => Math.round(node.position.x))).size;
}

/**
 * The drawing with its columns `gap` apart, from the top-left at 0, 0: the layout
 * is made at the narrowest gap and each column keeps its rank.
 */
export function withColumnGap<T extends Pick<Node, 'position'>>(
  nodes: readonly T[],
  gap: number,
): T[] {
  const columns = [...new Set(nodes.map((node) => Math.round(node.position.x)))].sort(
    (a, b) => a - b,
  );
  const top = Math.min(...nodes.map((node) => node.position.y));
  return nodes.map((node) => ({
    ...node,
    position: {
      x: columns.indexOf(Math.round(node.position.x)) * (width + gap),
      y: node.position.y - top,
    },
  }));
}
