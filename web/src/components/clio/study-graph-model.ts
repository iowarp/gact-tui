import type { ScienceStudy } from '@clio/core/v3';
import {
  branchTitle,
  entryState,
  entrySummary,
  outgoing,
  type ScienceState,
} from './science-log-model';

export interface StudyGraphNode {
  id: string;
  kind: string;
  title: string;
  branch: string;
  state: ScienceState;
  missing: boolean;
  /** For a group node: the entries it stands for. */
  members?: string[];
}

export interface StudyGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  /** How many recorded links this edge stands for (more than one into a group). */
  count?: number;
}

export interface StudyGraphModel {
  nodes: StudyGraphNode[];
  edges: StudyGraphEdge[];
}

/** Recorded entry relationships, including references whose targets are unavailable. */
export function studyGraph(study: ScienceStudy): StudyGraphModel {
  const titles = new Map(study.branches.map((branch) => [branch.session_id, branchTitle(branch)]));
  const entries = new Map(study.entries.map((entry) => [entry.id, entry]));
  const nodes: StudyGraphNode[] = [...entries.values()].map((entry) => ({
    id: entry.id,
    kind: entry.type,
    title: entrySummary(entry) || entry.id,
    branch: titles.get(entry.branch) || entry.branch,
    state: entryState(entry),
    missing: false,
  }));
  const missing = new Set<string>();
  const edges: StudyGraphEdge[] = [];
  for (const entry of entries.values()) {
    for (const link of outgoing(entry)) {
      if (!link.to) continue;
      edges.push({
        id: JSON.stringify([entry.id, link.to, link.relation]),
        source: entry.id,
        target: link.to,
        relation: link.relation.replaceAll('_', ' '),
      });
      if (!entries.has(link.to)) missing.add(link.to);
    }
  }
  for (const id of missing) {
    nodes.push({
      id,
      kind: 'unknown',
      title: `Unavailable entry ${id}`,
      branch: '',
      state: { label: 'unavailable', tone: 'neutral' },
      missing: true,
    });
  }
  return { nodes, edges };
}

/** An entry and every directly linked entry, in either direction. No inferred links. */
export function studyGraphNeighborhood(
  graph: StudyGraphModel,
  selectedId: string,
): StudyGraphModel {
  const ids = new Set([selectedId]);
  for (const edge of graph.edges) {
    if (edge.source === selectedId) ids.add(edge.target);
    if (edge.target === selectedId) ids.add(edge.source);
  }
  return {
    nodes: graph.nodes.filter((node) => ids.has(node.id)),
    edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

/** Each experiment's observations (two or more), keyed by their group node id. */
export function observationGroups(study: ScienceStudy): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const entry of study.entries) {
    if (entry.type !== 'observation') continue;
    const experiment = entry.links.find((link) => link.relation === 'experiment')?.to;
    const key = `group:${experiment || entry.branch}`;
    groups.set(key, [...(groups.get(key) ?? []), entry.id]);
  }
  for (const [key, ids] of groups) if (ids.length < 2) groups.delete(key);
  return groups;
}

/** The whole study at a readable size: each experiment's observations drawn as one node. */
export function studyGraphOverview(
  study: ScienceStudy,
  graph: StudyGraphModel = studyGraph(study),
): StudyGraphModel {
  const groups = observationGroups(study);
  const groupOf = new Map<string, string>();
  for (const [key, ids] of groups) for (const id of ids) groupOf.set(id, key);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodes = graph.nodes.filter((node) => !groupOf.has(node.id));
  for (const [key, ids] of groups) {
    const members = ids.map((id) => byId.get(id)).filter((node) => node !== undefined);
    const labels = new Set(members.map((node) => node.state.label));
    const branches = new Set(members.map((node) => node.branch));
    const [first] = members;
    nodes.push({
      id: key,
      kind: 'observations',
      title: `${ids.length} observations`,
      branch: branches.size === 1 ? (first?.branch ?? '') : `${branches.size} branches`,
      state:
        labels.size === 1 && first
          ? { ...first.state, label: `all ${first.state.label}` }
          : { label: 'mixed', tone: 'neutral' },
      missing: false,
      members: ids,
    });
  }
  const edges = new Map<string, StudyGraphEdge>();
  for (const edge of graph.edges) {
    const source = groupOf.get(edge.source) ?? edge.source;
    const target = groupOf.get(edge.target) ?? edge.target;
    if (source === target) continue;
    const id = JSON.stringify([source, target, edge.relation]);
    const seen = edges.get(id);
    edges.set(id, { ...edge, id, source, target, count: (seen?.count ?? 0) + (edge.count ?? 1) });
  }
  return { nodes, edges: [...edges.values()] };
}
