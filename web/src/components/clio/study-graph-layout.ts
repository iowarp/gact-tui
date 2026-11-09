import type { ScienceStudy } from '@clio/core/v3';
import { graphlib, layout } from '@dagrejs/dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { useMemo } from 'react';
import {
  studyGraph,
  studyGraphNeighborhood,
  studyGraphOverview,
  type StudyGraphModel,
  type StudyGraphNode,
} from './study-graph-model';

/** Each drawn entry's box, in graph units. */
export const STUDY_GRAPH_NODE = { width: 184, height: 52 };
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
  dag.setGraph({ rankdir: 'RL', nodesep: 20, ranksep: 56, marginx: 24, marginy: 24 });
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
      markerStart: {
        type: MarkerType.ArrowClosed,
        color: 'var(--muted-foreground)',
        width: 14,
        height: 14,
      },
      style: { stroke: 'var(--muted-foreground)', strokeWidth: 1 },
    })),
  };
}
