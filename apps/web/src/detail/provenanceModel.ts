/**
 * The provenance DATA-FLOW model (regrammar, owner sketch 2026-08-06).
 *
 * The graph's skeleton is `artifact → transform → artifact`, not "sessions
 * containing work". A transform (the wire's `activity`) is a first-class node:
 * every input artifact's edge CONVERGES into it and its `generated` edge lands
 * on the artifact it produced. Agent identity rides the transform as a BADGE
 * (the agent-task run label), never as a container box — the six
 * one-node session boxes the old view drew around six re-derivations of the
 * same CSV are exactly what this module removes.
 *
 * The module is pure: `RouteStep[]` in, a collapsed data-flow graph out. No
 * React, no DOM, no layout — {@link ./lineageLayout} does the geometry over
 * this, so the collapse rule can be asserted on its own.
 *
 * ## The collapse rule
 *
 * Two activities collapse into ONE transform node iff every one of these
 * SERVER-RECORDED facts matches:
 *
 *   1. the wire's `tool` (`activity.tool`, not a rendered label),
 *   2. the sorted set of `artifact_id`s on the FROM side of its `used` edges,
 *   3. the sorted set of `artifact_id`s on the TO side of its `generated`
 *      edges,
 *   4. the wire's activity `status`.
 *
 * An `artifact_id` is a per-VERSION id and one version is one sha256, so
 * matching input/output id sets IS the wire's own same-sha dedup fact —
 * nothing is matched on display names, session ids or run labels, and no
 * heuristic decides anything. A candidate with NO recorded output artifact
 * carries no dedup evidence at all and therefore never collapses, and neither
 * does one whose inputs/outputs include an artifact the wire gave no id (an
 * external authority-only leaf).
 */
import type { RouteEdge, RouteNode, RouteStep } from './types';

/** One recorded run of a transform — a single `activity` in the lineage wire. */
export interface ProvRun {
  /** The run's own route step index (drives `route-node-{index}` for the
   *  primary run, and the run row's identity in the expanded list). */
  index: number;
  /** The agent-task run label (`ndp #1`) — present for in-tree producers. */
  runLabel?: string;
  sessionId?: string;
  /** The producing session is outside the viewing session's tree. */
  foreign?: boolean;
  /** The producing session is an agent-task descendant of the viewer. */
  inTree?: boolean;
  /** The producing turn, for transcript navigation / hover context. */
  turnId?: string;
}

/**
 * Who produced a node, when the wire names ONE producer AND that producer is
 * worth naming: an agent-task descendant (its run label) or a genuinely
 * foreign session (its name). The VIEWING session is the panel's own implicit
 * context, so its work carries no badge — badging every line "this session"
 * would say nothing.
 */
export interface ProvProducer {
  runLabel?: string;
  sessionId?: string;
  foreign?: boolean;
  inTree?: boolean;
  turnId?: string;
}

export interface ProvNode {
  /** The primary run's route step index, as a string — unchanged from the
   *  pre-regrammar node id, so `route-node-{index}` testids and React Flow
   *  edge labels keep meaning the same thing. */
  id: string;
  index: number;
  kind: 'artifact' | 'transform' | 'gap';
  /** The primary route node — its label, chips, status and self marker. */
  node: RouteNode;
  /** Transforms: every collapsed run, in route order (length ≥ 1).
   *  Artifacts/gaps: empty. */
  runs: ProvRun[];
  /** `runs.length` for a transform, 1 otherwise — the `×N` badge. */
  multiplicity: number;
  /** The single producer, when the wire names exactly one. */
  producer?: ProvProducer;
  /** Set when the producers genuinely disagree — an artifact re-derived by N
   *  runs in N sessions has no ONE producing session, so naming one would be
   *  a lie. The transform's own run list carries the truth instead. */
  producerAmbiguous?: boolean;
  /** The foreign-session cluster drawn around this node, if any. */
  clusterId?: string;
}

export interface ProvEdge {
  id: string;
  /** The primary route step index (drives `route-edge-{index}`). */
  index: number;
  source: string;
  target: string;
  edge: RouteEdge;
  /** How many route edges collapsed into this one (`used ×7`). */
  multiplicity: number;
  /** An outgoing `used` edge from the SELF artifact — the "you are here"
   *  artifact's own usage, which the owner drew hanging below it. */
  usage?: boolean;
  /** This edge closes a cycle (a re-designation that both used AND generated
   *  the same artifact). It is still DRAWN — the wire recorded it — but it is
   *  excluded from rank assignment so the layout stays a layered DAG. */
  back?: boolean;
}

export interface ProvCluster {
  id: string;
  sessionId: string;
  createdAt?: string;
  memberIds: string[];
}

export interface ProvModel {
  nodes: ProvNode[];
  edges: ProvEdge[];
  clusters: ProvCluster[];
}

/**
 * Resolve an edge step's two endpoints to node step indices.
 *
 * `fromIndex`/`toIndex` are authoritative when present (routeFromLineage
 * records the walk's own positions). A route built before those existed falls
 * back to the flattened list's own adjacency — the node line immediately above
 * the edge and the next node line below it — so an old fixture still produces
 * the same chain rather than silently losing edges.
 */
export function edgeEndpoints(
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

interface RawEdge {
  index: number;
  from: number;
  to: number;
  edge: RouteEdge;
}

/**
 * The dedup key for an activity, or `null` when the wire records no dedup
 * evidence for it (see the module docstring). Exported so the rule can be
 * asserted directly, and so a caller can never re-derive a different one.
 */
export function transformKey(route: RouteStep[], index: number, edges: RawEdge[]): string | null {
  const step = route[index];
  if (!step || step.kind !== 'node' || step.nodeType !== 'activity') return null;
  const artifactId = (at: number): string | null => {
    const other = route[at];
    if (!other || other.kind !== 'node' || other.nodeType !== 'artifact') return null;
    return other.artifactId ?? null;
  };
  const inputs: string[] = [];
  const outputs: string[] = [];
  for (const raw of edges) {
    if (raw.edge.edge === 'used' && raw.to === index) {
      const id = artifactId(raw.from);
      if (!id) return null;
      inputs.push(id);
    } else if (raw.edge.edge === 'generated' && raw.from === index) {
      const id = artifactId(raw.to);
      if (!id) return null;
      outputs.push(id);
    }
  }
  // No recorded output ⇒ no same-sha evidence ⇒ never collapse.
  if (outputs.length === 0) return null;
  return JSON.stringify([
    step.tool ?? step.label,
    inputs.sort(),
    outputs.sort(),
    step.status ?? '',
  ]);
}

function runOf(node: RouteNode, index: number): ProvRun {
  return {
    index,
    ...(node.runLabel ? { runLabel: node.runLabel } : {}),
    ...(node.sessionId ? { sessionId: node.sessionId } : {}),
    ...(node.foreignSession ? { foreign: true } : {}),
    ...(node.treeSession ? { inTree: true } : {}),
    ...(node.turnId ? { turnId: node.turnId } : {}),
  };
}

/** Build the collapsed data-flow graph for a lineage route. */
export function provenanceModel(route: RouteStep[]): ProvModel {
  const nodeIndices: number[] = [];
  route.forEach((step, index) => {
    if (step.kind === 'node') nodeIndices.push(index);
  });
  if (nodeIndices.length === 0) return { nodes: [], edges: [], clusters: [] };

  const rawEdges: RawEdge[] = [];
  route.forEach((step, index) => {
    if (step.kind !== 'edge') return;
    const ends = edgeEndpoints(route, index, step);
    if (!ends || ends.from === ends.to) return;
    rawEdges.push({ index, from: ends.from, to: ends.to, edge: step });
  });

  // --- 1. group activities by the recorded dedup key -----------------------
  const groupMembers = new Map<string, number[]>();
  const groupOfIndex = new Map<number, string>();
  for (const index of nodeIndices) {
    const step = route[index] as RouteNode;
    if (step.nodeType !== 'activity') continue;
    // A non-collapsible activity gets a key nothing else can equal.
    const key = transformKey(route, index, rawEdges) ?? `solo:${index}`;
    groupOfIndex.set(index, key);
    const members = groupMembers.get(key);
    if (members) members.push(index);
    else groupMembers.set(key, [index]);
  }

  /** route step index → the collapsed node id that now represents it. */
  const nodeIdOf = new Map<number, string>();
  for (const index of nodeIndices) {
    const key = groupOfIndex.get(index);
    if (key === undefined) {
      nodeIdOf.set(index, String(index));
      continue;
    }
    const members = groupMembers.get(key)!;
    nodeIdOf.set(index, String(Math.min(...members)));
  }

  // --- 2. the collapsed nodes, in route order of their primary run ---------
  const nodes: ProvNode[] = [];
  for (const index of nodeIndices) {
    if (nodeIdOf.get(index) !== String(index)) continue; // a non-primary run
    const step = route[index] as RouteNode;
    if (step.nodeType === 'activity') {
      const members = groupMembers.get(groupOfIndex.get(index)!)!;
      const runs = [...members]
        .sort((a, b) => a - b)
        .map((at) => runOf(route[at] as RouteNode, at));
      nodes.push({
        id: String(index),
        index,
        kind: 'transform',
        node: step,
        runs,
        multiplicity: runs.length,
      });
      continue;
    }
    nodes.push({
      id: String(index),
      index,
      kind: step.nodeType === 'gap' ? 'gap' : 'artifact',
      node: step,
      runs: [],
      multiplicity: 1,
    });
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));

  // --- 3. edges, remapped onto the collapsed nodes and merged -------------
  const merged = new Map<string, ProvEdge>();
  for (const raw of rawEdges) {
    const source = nodeIdOf.get(raw.from);
    const target = nodeIdOf.get(raw.to);
    if (!source || !target || source === target) continue;
    const key = `${source}->${target}:${raw.edge.edge}:${raw.edge.stance ?? ''}`;
    const seen = merged.get(key);
    if (seen) {
      seen.multiplicity += 1;
      continue;
    }
    merged.set(key, {
      id: `e${raw.index}`,
      index: raw.index,
      source,
      target,
      edge: raw.edge,
      multiplicity: 1,
    });
  }
  const edges = [...merged.values()].sort((a, b) => a.index - b.index);

  // --- 4. the SELF artifact's own uses hang off it as usage edges ---------
  const selfId = nodes.find((node) => node.node.self)?.id;
  for (const edge of edges) {
    if (edge.edge.edge === 'used' && edge.source === selfId) edge.usage = true;
  }

  markBackEdges(nodes, edges);
  resolveProducers(nodes, edges, byId);
  const clusters = clusterForeignRuns(nodes);
  return { nodes, edges, clusters };
}

/**
 * Mark the edges that close a cycle so the layout can rank on a real DAG.
 *
 * The live wire genuinely contains one: `create_artifact` USED the png it also
 * GENERATED (a re-designation re-registers bytes that already exist). Deleting
 * either edge would delete a recorded fact, so both are kept and drawn; only
 * the one that closes the cycle stops constraining rank.
 *
 * A re-designation pair is resolved by RULE rather than by traversal order:
 * the artifact's `generated` edge steps aside when some OTHER transform also
 * produced it (the real producer stays above, and the re-designating use hangs
 * below, which is where uses belong); when the re-designating transform is the
 * only producer it stays above and its `used` edge steps aside instead. Any
 * remaining cycle is broken by a deterministic DFS in node order.
 */
function markBackEdges(nodes: ProvNode[], edges: ProvEdge[]): void {
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const byPair = new Map<string, ProvEdge[]>();
  for (const edge of edges) {
    const key = pairKey(edge.source, edge.target);
    const list = byPair.get(key);
    if (list) list.push(edge);
    else byPair.set(key, [edge]);
  }
  for (const list of byPair.values()) {
    const used = list.find((edge) => edge.edge.edge === 'used');
    const generated = list.find((edge) => edge.edge.edge === 'generated');
    if (!used || !generated || used.source !== generated.target) continue;
    const artifact = generated.target;
    const otherProducer = edges.some(
      (edge) => edge !== generated && edge.edge.edge === 'generated' && edge.target === artifact,
    );
    (otherProducer ? generated : used).back = true;
  }

  const out = new Map<string, ProvEdge[]>();
  for (const edge of edges) {
    const list = out.get(edge.source);
    if (list) list.push(edge);
    else out.set(edge.source, [edge]);
  }
  const done = new Set<string>();
  const onStack = new Set<string>();
  const visit = (id: string): void => {
    onStack.add(id);
    for (const edge of out.get(id) ?? []) {
      if (edge.back) continue;
      if (onStack.has(edge.target)) {
        edge.back = true;
        continue;
      }
      if (!done.has(edge.target)) visit(edge.target);
    }
    onStack.delete(id);
    done.add(id);
  };
  for (const node of nodes) if (!done.has(node.id)) visit(node.id);
}

/**
 * Resolve each node's ONE producer, or record that there isn't one.
 *
 * A transform's producer is its own session when every collapsed run shares
 * it. An artifact's producer is the session behind the `generated` edges into
 * it — when those resolve to more than one session (seven equivalent
 * re-derivations in seven sessions) the artifact is marked ambiguous and gets
 * no session badge and no cluster, because there is no honest single name.
 */
function resolveProducers(
  nodes: ProvNode[],
  edges: ProvEdge[],
  byId: Map<string, ProvNode>,
): void {
  for (const node of nodes) {
    if (node.kind !== 'transform') continue;
    const sessions = new Set(node.runs.map((run) => run.sessionId ?? ''));
    if (sessions.size > 1) {
      node.producerAmbiguous = true;
      continue;
    }
    const primary = node.runs[0];
    if (primary?.sessionId && (primary.foreign || primary.inTree)) {
      node.producer = {
        sessionId: primary.sessionId,
        ...(primary.runLabel ? { runLabel: primary.runLabel } : {}),
        ...(primary.foreign ? { foreign: true } : {}),
        ...(primary.inTree ? { inTree: true } : {}),
        ...(primary.turnId ? { turnId: primary.turnId } : {}),
      };
    }
  }

  for (const node of nodes) {
    if (node.kind === 'transform') continue;
    const producers = edges
      .filter((edge) => edge.edge.edge === 'generated' && edge.target === node.id)
      .map((edge) => byId.get(edge.source))
      .filter((source): source is ProvNode => source !== undefined);
    if (producers.some((source) => source.producerAmbiguous)) {
      node.producerAmbiguous = true;
      continue;
    }
    const sessions = new Set(
      producers.map((source) => source.producer?.sessionId ?? '').filter(Boolean),
    );
    if (sessions.size > 1) {
      node.producerAmbiguous = true;
      continue;
    }
    // The route node already carries its producer's session (routeFromLineage
    // resolved it from the producing activity) — reuse that fact rather than
    // re-deriving a second, possibly different one.
    if (node.node.sessionId && (node.node.foreignSession || node.node.treeSession)) {
      node.producer = {
        sessionId: node.node.sessionId,
        ...(node.node.runLabel ? { runLabel: node.node.runLabel } : {}),
        ...(node.node.foreignSession ? { foreign: true } : {}),
        ...(node.node.treeSession ? { inTree: true } : {}),
      };
    }
  }
}

/**
 * A genuinely foreign session's contiguous run of nodes keeps the light
 * cluster box (rule 1: never for in-tree sessions, whose identity is a badge).
 * A node with no single producing session — a collapsed multi-session
 * transform, or an artifact those produced — is never a member: a box implies
 * "this session did this", which would not be true.
 *
 * Contiguity is per RUN, not per session: the same foreign session appearing
 * twice with other work between gets two boxes, one per run.
 */
function clusterForeignRuns(nodes: ProvNode[]): ProvCluster[] {
  const clusters: ProvCluster[] = [];
  let current: ProvCluster | null = null;
  let currentSession: string | null = null;
  for (const node of nodes) {
    const sessionId =
      !node.producerAmbiguous && node.multiplicity === 1 && node.producer?.foreign
        ? node.producer.sessionId
        : undefined;
    if (!sessionId) {
      current = null;
      currentSession = null;
      continue;
    }
    if (!current || currentSession !== sessionId) {
      current = { id: `cluster:${sessionId}:${node.index}`, sessionId, memberIds: [] };
      currentSession = sessionId;
      clusters.push(current);
    }
    current.memberIds.push(node.id);
    node.clusterId = current.id;
    if (node.node.createdAt && !current.createdAt) current.createdAt = node.node.createdAt;
  }
  return clusters;
}
