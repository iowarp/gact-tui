/**
 * The provenance lineage graph model (viz rebuild, 2026-08).
 *
 * Turns the flattened `RouteStep[]` into a laid-out DAG for React Flow. Pure:
 * no React, no DOM, no measurement — layout is computed by dagre from character
 * counts, which is exact here because every lineage line is set in JetBrains
 * Mono. That is what makes the layout deterministic (same route ⇒ same
 * coordinates) and unit-testable without a browser.
 *
 * The APPROVED semantics of docs/design/provenance-graph-2026-08.md are
 * preserved, not replaced: one-line minimal nodes (◆ artifact / ⚙ activity /
 * ▢ gap + name + muted sub-info), `verb → evidence` edge labels, foreign-session
 * clusters with a clickable header, the self node anchored and highlighted,
 * chronology reading top→bottom. What the graph library adds is pan/zoom, a
 * proper layered layout, and REAL branch/merge geometry for multi-input
 * activities — the thing the flattened list could only hint at with a `╮`.
 */
import dagre from '@dagrejs/dagre';
import type { RouteEdge, RouteNode, RouteStep } from './types';

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
const NODE_MAX_PX = 460;
const NODE_HEIGHT_PX = 26;

/** Cluster box padding around its member nodes, and the header strip height. */
const CLUSTER_PAD_PX = 10;
const CLUSTER_HEADER_PX = 24;

/** Dagre spacing. `ranksep` has to clear an edge label line (`generated →
 *  hashed-at-use`) drawn at the midpoint of every edge. */
const RANK_SEP_PX = 46;
const NODE_SEP_PX = 26;

export interface LineageGraphNode {
  /** Stable id — the node's own step index, which is also its testid suffix. */
  id: string;
  /** The step index this node came from (drives `route-node-{index}`). */
  index: number;
  node: RouteNode;
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
  edge: RouteEdge;
}

export interface LineageCluster {
  id: string;
  sessionId: string;
  /** The cluster header's timestamp — the first (oldest) member's mint time. */
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

/**
 * A node's laid-out width. Deterministic by construction: monospace advance ×
 * character count for the name, plus a measured-constant box per chip/pill/
 * badge/self-marker, clamped to a readable band. No DOM is consulted, so the
 * same route lays out identically in jsdom and in the browser.
 */
export function nodeWidth(node: RouteNode): number {
  let width = NODE_CHROME_PX + node.label.length * CHAR_PX;
  for (const chip of nodeChips(node)) {
    width += chip.length * CHIP_CHAR_PX + CHIP_PADDING_PX + 6;
  }
  if (node.treeSession && node.runLabel) {
    width += node.runLabel.length * CHIP_CHAR_PX + CHIP_PADDING_PX + 6;
  }
  if (node.status) width += node.status.length * CHIP_CHAR_PX + CHIP_PADDING_PX + 6;
  if (node.self) width += 'you are here'.length * CHIP_CHAR_PX + CHIP_PADDING_PX + 6;
  return Math.max(NODE_MIN_PX, Math.min(NODE_MAX_PX, Math.round(width)));
}

/**
 * One contiguous run of lineage steps belonging to a foreign session — the
 * cluster grammar from the design spec (rule 3), unchanged. An edge belongs to
 * the cluster of the node it leads INTO (the following node).
 *
 * Moved here from DetailSlot so the graph layout and the rendering agree on one
 * segmentation instead of computing it twice.
 */
export interface LineageSegment {
  sessionId?: string;
  createdAt?: string;
  steps: { step: RouteStep; index: number }[];
}

export function segmentRoute(route: RouteStep[]): LineageSegment[] {
  const keyAt = (from: number): string | null => {
    for (let i = from; i < route.length; i += 1) {
      const step = route[i]!;
      if (step.kind === 'node') return step.foreignSession && step.sessionId ? step.sessionId : null;
    }
    return null;
  };
  const segments: LineageSegment[] = [];
  route.forEach((step, index) => {
    const key = keyAt(index);
    const last = segments[segments.length - 1];
    const lastKey = last ? (last.sessionId ?? null) : undefined;
    if (!last || lastKey !== key) {
      segments.push({ ...(key ? { sessionId: key } : {}), steps: [] });
    }
    const segment = segments[segments.length - 1]!;
    segment.steps.push({ step, index });
    if (step.kind === 'node' && step.createdAt && !segment.createdAt) {
      segment.createdAt = step.createdAt;
    }
  });
  return segments;
}

/**
 * Resolve an edge step's two endpoints to node step indices.
 *
 * `fromIndex`/`toIndex` are authoritative when present (routeFromLineage records
 * the walk's own positions). A route built before those existed falls back to
 * the flattened list's own adjacency — the node line immediately above the edge
 * and the next node line below it — which is exactly what the old connector-rail
 * rendering drew, so an old fixture still produces the same chain rather than
 * silently losing edges.
 */
function edgeEndpoints(
  route: RouteStep[],
  index: number,
  edge: RouteEdge,
): { from: number; to: number } | null {
  if (edge.fromIndex !== undefined && edge.toIndex !== undefined) {
    if (route[edge.fromIndex]?.kind === 'node' && route[edge.toIndex]?.kind === 'node') {
      return { from: edge.fromIndex, to: edge.toIndex };
    }
  }
  let before = -1;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (route[i]?.kind === 'node') {
      before = i;
      break;
    }
  }
  let after = -1;
  for (let i = index + 1; i < route.length; i += 1) {
    if (route[i]?.kind === 'node') {
      after = i;
      break;
    }
  }
  if (before === -1 || after === -1) return null;
  return { from: before, to: after };
}

/**
 * Lay the route out as a layered DAG, top→bottom (chronology reads downward,
 * matching the spec's "oldest first, self normally last").
 *
 * Determinism: dagre is seeded with the nodes in route order and the edges in
 * route order, node sizes are computed not measured, and no option here depends
 * on the environment — so the same `RouteStep[]` always yields the same
 * coordinates. `tests/unit/lineage-graph.test.ts` asserts that directly.
 */
export function layoutLineage(route: RouteStep[]): LineageLayout {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: 'TB', ranksep: RANK_SEP_PX, nodesep: NODE_SEP_PX, marginx: 8, marginy: 8 });
  graph.setDefaultEdgeLabel(() => ({}));

  const segments = segmentRoute(route);
  // A cluster id is per SEGMENT, not per session: the same foreign session can
  // appear twice non-contiguously (with another session's work between), and
  // the design's contiguity rule gives each run its own header. Keying on the
  // session alone would collapse the two into one box.
  const segmentId = (segment: LineageSegment): string =>
    `cluster:${segment.sessionId}:${segment.steps[0]?.index ?? 0}`;
  const clusterOfIndex = new Map<number, string>();
  for (const segment of segments) {
    if (!segment.sessionId) continue;
    const id = segmentId(segment);
    for (const { index } of segment.steps) clusterOfIndex.set(index, id);
  }

  const nodeIndices: number[] = [];
  route.forEach((step, index) => {
    if (step.kind !== 'node') return;
    nodeIndices.push(index);
    graph.setNode(String(index), { width: nodeWidth(step), height: NODE_HEIGHT_PX });
  });
  if (nodeIndices.length === 0) {
    return { nodes: [], edges: [], clusters: [], width: 0, height: 0 };
  }

  const edges: Array<{ index: number; from: number; to: number; edge: RouteEdge }> = [];
  route.forEach((step, index) => {
    if (step.kind !== 'edge') return;
    const ends = edgeEndpoints(route, index, step);
    if (!ends || ends.from === ends.to) return;
    edges.push({ index, from: ends.from, to: ends.to, edge: step });
    graph.setEdge(String(ends.from), String(ends.to), {}, `e${index}`);
  });

  dagre.layout(graph);

  const laidOut: LineageGraphNode[] = nodeIndices.map((index) => {
    const positioned = graph.node(String(index)) as { x: number; y: number; width: number; height: number };
    const step = route[index] as RouteNode;
    const clusterId = clusterOfIndex.get(index);
    return {
      id: String(index),
      index,
      node: step,
      ...(clusterId ? { clusterId } : {}),
      // dagre reports centres; React Flow positions by top-left.
      x: Math.round(positioned.x - positioned.width / 2),
      y: Math.round(positioned.y - positioned.height / 2),
      width: Math.round(positioned.width),
      height: Math.round(positioned.height),
    };
  });

  const byId = new Map(laidOut.map((node) => [node.id, node]));
  const clusters: LineageCluster[] = [];
  for (const segment of segments) {
    if (!segment.sessionId) continue;
    const members = segment.steps
      .filter(({ step }) => step.kind === 'node')
      .map(({ index }) => byId.get(String(index)))
      .filter((node): node is LineageGraphNode => node !== undefined);
    if (members.length === 0) continue;
    const left = Math.min(...members.map((node) => node.x)) - CLUSTER_PAD_PX;
    const right = Math.max(...members.map((node) => node.x + node.width)) + CLUSTER_PAD_PX;
    const top = Math.min(...members.map((node) => node.y)) - CLUSTER_PAD_PX - CLUSTER_HEADER_PX;
    const bottom = Math.max(...members.map((node) => node.y + node.height)) + CLUSTER_PAD_PX;
    clusters.push({
      id: segmentId(segment),
      sessionId: segment.sessionId,
      ...(segment.createdAt ? { createdAt: segment.createdAt } : {}),
      memberIds: members.map((node) => node.id),
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }

  // The whole drawing's extent, including cluster boxes (a cluster header sits
  // ABOVE its first member, so it can be the topmost thing on the canvas).
  const boxes = [
    ...laidOut.map((node) => ({ x: node.x, y: node.y, w: node.width, h: node.height })),
    ...clusters.map((cluster) => ({ x: cluster.x, y: cluster.y, w: cluster.width, h: cluster.height })),
  ];
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const width = Math.max(...boxes.map((box) => box.x + box.w)) - minX;
  const height = Math.max(...boxes.map((box) => box.y + box.h)) - minY;

  return {
    nodes: laidOut,
    edges: edges.map((entry) => ({
      id: `e${entry.index}`,
      index: entry.index,
      source: String(entry.from),
      target: String(entry.to),
      edge: entry.edge,
    })),
    clusters,
    width,
    height,
  };
}
