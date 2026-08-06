/**
 * Geometry for the provenance data-flow graph (regrammar, 2026-08-06).
 *
 * {@link ./provenanceModel} decides WHAT the graph is — which transforms
 * collapsed, what converges where, which foreign sessions keep a box. This
 * module only decides where it sits: a dagre layered pass, top→bottom, so
 * chronology reads downward and every input's edge converges on the transform
 * that consumed it.
 *
 * Pure and deterministic: node sizes are computed from character counts (the
 * lines are monospace, so that is exact, not an estimate), no DOM is consulted,
 * and nothing here depends on the environment — the same route yields the same
 * coordinates in jsdom and in Chrome, which is what makes the layout
 * unit-testable at all.
 *
 * Cluster boxes are laid out by dagre itself, as a COMPOUND graph
 * (`setParent`), not fitted around the members afterwards. That is the fix for
 * the routing bug the owner marked "under": a box dagre does not know about is
 * a box dagre routes edges straight through.
 */
import dagre from '@dagrejs/dagre';
import { provenanceModel, type ProvEdge, type ProvNode, type ProvProducer } from './provenanceModel';
import type { RouteNode, RouteStep } from './types';

/** JetBrains Mono advance width at the lineage font size (11.5px * --ts, --ts
 *  defaults to 1). Mono, so character count × this IS the text width. */
const CHAR_PX = 6.9;
/** Chip/pill text is set two steps down (10px / 9.5px) inside a 1px border with
 *  5–6px of horizontal padding. */
const CHIP_CHAR_PX = 6;
const CHIP_PADDING_PX = 13;
/** Glyph column + the flex gaps + the node's own padding. */
const NODE_CHROME_PX = 34;
const NODE_MIN_PX = 130;
/** Wide enough for the real EarthScope line — a 35-character artifact name
 *  plus the producer badge, version, size and the you-are-here marker — so the
 *  self node's own facts are not the first thing the clamp eats. The canvas
 *  pans, so a wide node costs nothing a narrow panel cannot reach. */
const NODE_MAX_PX = 545;
const NODE_HEIGHT_PX = 26;

/** The cluster header strip drawn inside dagre's own top padding
 *  (`ranksep / 2`, measured), so it never overlaps a member line. */
export const CLUSTER_HEADER_PX = 18;

/** Dagre spacing. `ranksep` has to clear an edge label line (`generated →
 *  hash-pair`) drawn at the midpoint of every edge, AND leave room above a
 *  cluster's first member for its header strip. `edgesep` keeps converging
 *  inputs from stacking their labels on one another. */
const RANK_SEP_PX = 52;
const NODE_SEP_PX = 30;
const EDGE_SEP_PX = 22;

export interface LineageGraphNode {
  /** The primary run's route step index, as a string — also the testid
   *  suffix (`route-node-{index}`). */
  id: string;
  index: number;
  node: RouteNode;
  /** The collapsed model node: run list, multiplicity, producer. */
  prov: ProvNode;
  /** The foreign session whose cluster holds this node, if any. */
  clusterId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LineageGraphEdge {
  id: string;
  /** The step index this edge came from (drives `route-edge-{index}`). */
  index: number;
  source: string;
  target: string;
  prov: ProvEdge;
}

export interface LineageCluster {
  id: string;
  sessionId: string;
  /** The cluster header's timestamp — the first member's mint time. */
  createdAt?: string;
  memberIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LineageLayout {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
  clusters: LineageCluster[];
  width: number;
  height: number;
}

/** Resolves a producer to the short NAME shown on a node's badge (rule 4:
 *  names, never raw ids). Defaults to the agent-task run label; a caller with
 *  the session-title map resolves foreign producers to their session name. */
export type ProducerBadge = (producer: ProvProducer) => string | undefined;

const defaultBadge: ProducerBadge = (producer) => producer.runLabel;

/** The sub-info chips a node line shows, in order — the exact list the node
 *  component renders, so width and render never disagree. */
export function nodeChips(node: RouteNode): string[] {
  const parts: string[] = [];
  if (node.nodeType === 'gap') parts.push(node.gapReason ?? 'no transform recorded');
  else if (node.nodeType === 'activity') {
    if (node.duration) parts.push(node.duration);
  } else {
    if (node.version) parts.push(node.version);
    if (node.size) parts.push(node.size);
  }
  if (node.sub) parts.push(node.sub);
  return parts;
}

/** `×7` — the multiplicity badge, absent for a single-run node. */
export function multiplicityLabel(prov: ProvNode): string | undefined {
  return prov.multiplicity > 1 ? `×${prov.multiplicity}` : undefined;
}

/**
 * A node's laid-out width. Deterministic by construction: monospace advance ×
 * character count for the name, plus a measured-constant box per chip/pill/
 * badge/self-marker, clamped to a readable band. No DOM is consulted.
 */
export function nodeWidth(node: RouteNode, badges: string[] = []): number {
  let width = NODE_CHROME_PX + node.label.length * CHAR_PX;
  const box = (text: string) => text.length * CHIP_CHAR_PX + CHIP_PADDING_PX + 6;
  for (const chip of nodeChips(node)) width += box(chip);
  for (const badge of badges) width += box(badge);
  if (node.status) width += box(node.status);
  if (node.self) width += box('you are here');
  return Math.max(NODE_MIN_PX, Math.min(NODE_MAX_PX, Math.round(width)));
}

/** Every badge a node line renders, in order — the width and the component
 *  read the SAME list, so they can never disagree. */
export function nodeBadges(prov: ProvNode, badge: ProducerBadge = defaultBadge): string[] {
  const badges: string[] = [];
  // A node inside a cluster is already named by the cluster header; badging it
  // again would say the same thing twice.
  if (prov.producer && !prov.clusterId) {
    const text = badge(prov.producer);
    if (text) badges.push(text);
  }
  const multiplicity = multiplicityLabel(prov);
  if (multiplicity) badges.push(multiplicity);
  return badges;
}

/**
 * Lay the collapsed data-flow graph out top→bottom.
 *
 * Only non-`back` edges constrain rank: the wire genuinely records a
 * re-designation that both used and generated the same artifact, and a cycle
 * has no layering. The edge is still returned and still drawn — it is a
 * recorded fact — it just does not decide who sits above whom.
 */
export function layoutLineage(route: RouteStep[], badge: ProducerBadge = defaultBadge): LineageLayout {
  const model = provenanceModel(route);
  if (model.nodes.length === 0) {
    return { nodes: [], edges: [], clusters: [], width: 0, height: 0 };
  }

  const graph = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  graph.setGraph({
    rankdir: 'TB',
    ranksep: RANK_SEP_PX,
    nodesep: NODE_SEP_PX,
    edgesep: EDGE_SEP_PX,
    marginx: 8,
    marginy: 8,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const cluster of model.clusters) graph.setNode(cluster.id, {});
  for (const node of model.nodes) {
    graph.setNode(node.id, {
      width: nodeWidth(node.node, nodeBadges(node, badge)),
      height: NODE_HEIGHT_PX,
    });
    // A compound parent is what makes dagre reserve the box and route edges
    // AROUND it instead of under it.
    if (node.clusterId) graph.setParent(node.id, node.clusterId);
  }
  for (const edge of model.edges) {
    if (edge.back) continue;
    graph.setEdge(edge.source, edge.target, {}, edge.id);
  }

  dagre.layout(graph);

  // dagre reports centres; React Flow positions by top-left.
  const boxOf = (id: string) => {
    const positioned = graph.node(id) as { x: number; y: number; width: number; height: number };
    return {
      x: Math.round(positioned.x - positioned.width / 2),
      y: Math.round(positioned.y - positioned.height / 2),
      width: Math.round(positioned.width),
      height: Math.round(positioned.height),
    };
  };

  const nodes: LineageGraphNode[] = model.nodes.map((node) => ({
    id: node.id,
    index: node.index,
    node: node.node,
    prov: node,
    ...(node.clusterId ? { clusterId: node.clusterId } : {}),
    ...boxOf(node.id),
  }));

  const clusters: LineageCluster[] = model.clusters.map((cluster) => ({
    id: cluster.id,
    sessionId: cluster.sessionId,
    ...(cluster.createdAt ? { createdAt: cluster.createdAt } : {}),
    memberIds: cluster.memberIds,
    ...boxOf(cluster.id),
  }));

  const boxes = [...nodes, ...clusters];
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const width = Math.max(...boxes.map((box) => box.x + box.width)) - minX;
  const height = Math.max(...boxes.map((box) => box.y + box.height)) - minY;

  return {
    nodes,
    edges: model.edges.map((edge) => ({
      id: edge.id,
      index: edge.index,
      source: edge.source,
      target: edge.target,
      prov: edge,
    })),
    clusters,
    width,
    height,
  };
}
