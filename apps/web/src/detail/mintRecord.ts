/**
 * Minting live `ArtifactRecord`s for the right-pane DetailSlot from the two
 * real wire sources: the session artifacts route (records with versions[])
 * and the artifact lineage route (nodes/edges → the provenance chain).
 */
import type { SessionArtifactRecord, SessionArtifactVersion } from '@clio/core';
import { humanSize } from '../wire/presentationUtils';
import type { ArtifactRecord, RouteEdgeKind, RouteStep } from './types';

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

/** The version to show for a record — the head (latest) version. */
export function headVersion(record: SessionArtifactRecord): SessionArtifactVersion | undefined {
  const versions = record.versions ?? [];
  if (versions.length === 0) return undefined;
  const head = record.head_artifact_id
    ? versions.find((v) => v.artifact_id === record.head_artifact_id)
    : undefined;
  return head ?? versions[versions.length - 1];
}

export function mintArtifactRecord(
  record: SessionArtifactRecord,
  version: SessionArtifactVersion,
): ArtifactRecord {
  const sizeBytes = Number(version.size_bytes ?? 0);
  const out: ArtifactRecord = {
    id: version.artifact_id,
    recordKind: 'artifact',
    breadcrumb: ['session', record.name],
  };
  const kind = str(version.kind ?? record.kind);
  if (kind) out.kind = kind;
  if (sizeBytes > 0) out.size = humanSize(sizeBytes);
  const sha = str(version['sha256']);
  if (sha) out.sha = sha;
  const mechanism = str(version['mechanism']);
  if (mechanism) out.mechanism = mechanism;
  const designation = str(version.producer?.designation);
  if (designation) out.designation = designation;
  const evidence = str(version['evidence_class']);
  if (evidence) out.evidence = evidence;
  const custody = str(version['custody']);
  if (custody) out.custody = custody;
  const note = str(version['annotation']);
  if (note) out.note = note;
  const producerTool = str(version.producer?.tool);
  if (producerTool) out.instrument = producerTool;
  if (typeof version.version === 'number') out.revision = `v${version.version}`;
  const storagePath = str(version['path']);
  if (storagePath) out.storagePath = storagePath;
  const workspaceId = str(version.workspace_id ?? record.workspace_id);
  if (workspaceId) out.workspaceId = workspaceId;
  // The S4 honest custody-break marker is the ONE replay-contract fact this
  // wire carries; reproducible/re-runnable live on the transform payloads
  // (#971) and are never fabricated here.
  if (version['custody_gap']) out.transformStatus = 'gap';
  return out;
}

/** The lineage route's wire graph (routes/artifact_lineage.py). */
export interface LineageNode {
  id: string;
  type: 'artifact' | 'activity' | 'gap';
  name?: string;
  version?: number;
  kind?: string;
  tool?: string;
  call_id?: string;
  status?: string;
  replay?: string;
  session_id?: string;
  turn_id?: string;
  producer_call_id?: string;
  external?: boolean;
  [key: string]: unknown;
}

export interface LineageEdge {
  from: string;
  to: string;
  type: string;
  evidence?: string;
  [key: string]: unknown;
}

export interface LineageGraph {
  root: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  truncated?: { reason: string; nodes?: number; at_depth?: number } | null;
}

const EDGE_KINDS: Record<string, RouteEdgeKind> = {
  used: 'used',
  generated: 'generated',
  revision_of: 'revised',
};

/**
 * Context for {@link routeFromLineage} (provenance rework 2026-08): the
 * viewing session (foreign producers group under cluster headers) and the
 * session-artifacts listing's versions by `artifact_id` — the ONLY wire that
 * carries an artifact version's `size_bytes` / `created_at` / `producer`
 * (the lineage route's artifact nodes carry none of these).
 */
export interface RouteMintContext {
  viewerSessionId?: string;
  versionsById?: Map<string, SessionArtifactVersion>;
}

/** Human duration for an activity line (`7.9s`, `1m 12s`). */
function humanDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
}

/** The activity node's wire duration, when a wire carries one (`duration_ms`,
 *  or a `started_at`/`ended_at` ISO pair). Today's lineage wire carries
 *  neither — the line simply omits the duration rather than inventing one. */
function activityDuration(node: LineageNode): string {
  const ms = node['duration_ms'];
  if (typeof ms === 'number') return humanDuration(ms);
  const started = Date.parse(str(node['started_at']));
  const ended = Date.parse(str(node['ended_at']));
  if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
    return humanDuration(ended - started);
  }
  return '';
}

/** The activity line's status pill: `failed` from the wire status, else the
 *  replay contract when it is the noteworthy `reproducible`. The wire's
 *  `re-runnable` default is the plain-ok baseline — no pill (Mockups 1/2);
 *  `gap` rides gap NODES, not successful activities. */
function activityStatus(node: LineageNode): string {
  if (str(node.status) === 'failed') return 'failed';
  const replay = str(node.replay);
  return replay === 'reproducible' ? replay : '';
}

function nodeStep(
  node: LineageNode,
  selfId: string,
  producerSession: (node: LineageNode) => string,
  context: RouteMintContext,
): RouteStep {
  const viewer = context.viewerSessionId ?? '';
  const withSession = (sessionId: string) => ({
    ...(sessionId ? { sessionId } : {}),
    ...(sessionId && viewer && sessionId !== viewer ? { foreignSession: true } : {}),
  });
  if (node.type === 'activity') {
    const label = str(node.tool) || str(node.call_id) || node.id;
    const tool = str(node.tool);
    const duration = activityDuration(node);
    const status = activityStatus(node);
    const turnId = str(node.turn_id);
    return {
      kind: 'node',
      nodeType: 'activity',
      label,
      ...(tool ? { tool } : {}),
      ...(duration ? { duration } : {}),
      ...(status ? { status } : {}),
      ...(turnId ? { turnId } : {}),
      ...withSession(str(node.session_id)),
    };
  }
  const label = str(node.name) || node.id;
  const fact = context.versionsById?.get(node.id);
  const size = fact ? humanSize(fact.size_bytes) : '';
  const createdAt = str(fact?.created_at);
  const sessionId = producerSession(node) || str(fact?.producer?.session_id);
  return {
    kind: 'node',
    nodeType: node.type === 'gap' ? 'gap' : 'artifact',
    label,
    // An external (authority-only) leaf is not a registry version — no
    // artifactId means no click affordance, never a dead push target.
    ...(node.external ? { sub: 'external source' } : { artifactId: node.id }),
    ...(typeof node.version === 'number' ? { version: `v${node.version}` } : {}),
    ...(size ? { size } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(node.type === 'gap' ? { gapReason: 'no transform recorded' } : {}),
    ...withSession(sessionId),
    ...(node.id === selfId ? { self: true } : {}),
  };
}

/**
 * Flattens the lineage graph into the one-line-per-node vertical chain
 * (docs/design/provenance-graph-2026-08.md): a deterministic walk from the
 * upstream-most inputs down to the root and on through downstream
 * derivations. Every node and edge appears exactly once. Each edge renders as
 * a connector line under its earlier endpoint; an edge whose consumer is NOT
 * the next line carries `join: true` (the `╮` elbow into the consumer), so a
 * branchy multi-input graph keeps every input's edge visible instead of
 * dropping the non-adjacent ones.
 */
export function routeFromLineage(graph: LineageGraph, context: RouteMintContext = {}): RouteStep[] {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!nodesById.has(graph.root)) return [];

  // Order nodes: BFS upstream of root (inputs first, deepest first), then
  // root, then BFS downstream.
  const upstream: string[] = [];
  const downstream: string[] = [];
  const seen = new Set<string>([graph.root]);
  let frontier = [graph.root];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of graph.edges) {
        // Whatever the edge's own direction, the node on its other end that
        // we haven't placed yet belongs to this side of the walk.
        const other = edge.from === id ? edge.to : edge.to === id ? edge.from : '';
        if (other && !seen.has(other) && nodesById.has(other)) {
          seen.add(other);
          if (upstreamOf(edge, id)) {
            next.push(other);
            upstream.unshift(other);
          } else {
            next.push(other);
            downstream.push(other);
          }
        }
      }
    }
    frontier = next;
  }

  const order = [...upstream, graph.root, ...downstream];
  const placed = new Set(order);
  // Anything the walk missed (disconnected fragments) still renders.
  for (const node of graph.nodes) {
    if (!placed.has(node.id)) order.push(node.id);
  }

  // An artifact's producing session is its producer ACTIVITY's session — the
  // lineage wire's artifact nodes carry `producer_call_id`, and the activity
  // node `activity:<call_id>` in the same graph carries the session id. The
  // version's recorded producer call can differ from the TransformRecord that
  // generated it (observed live: a re-designation mints a new call id) — the
  // graph's own `generated` edge INTO the node is equally real evidence, so
  // it is the fallback, never a guess.
  const producerSession = (node: LineageNode): string => {
    const callId = str(node.producer_call_id);
    if (callId) {
      const producer = nodesById.get(`activity:${callId}`);
      if (producer) return str(producer.session_id);
    }
    const generated = graph.edges.find((e) => e.type === 'generated' && e.to === node.id);
    if (generated) {
      const producer = nodesById.get(generated.from);
      if (producer) return str(producer.session_id);
    }
    return '';
  };

  const position = new Map(order.map((id, index) => [id, index]));
  const usedEdges = new Set<LineageEdge>();
  const steps: RouteStep[] = [];
  order.forEach((id, index) => {
    const node = nodesById.get(id);
    if (!node) return;
    steps.push(nodeStep(node, graph.root, producerSession, context));
    // Every edge between this node and a LATER one renders as a connector
    // under this line, nearest consumer first. `join` marks a consumer that is
    // not the immediately following line (the `╮` elbow, spec rules 2/4).
    const outgoing = graph.edges
      .filter((e) => {
        if (usedEdges.has(e)) return false;
        const other = e.from === id ? e.to : e.to === id ? e.from : '';
        if (!other) return false;
        const at = position.get(other);
        return at !== undefined && at > index;
      })
      .sort((a, b) => {
        const ja = position.get(a.from === id ? a.to : a.from) ?? 0;
        const jb = position.get(b.from === id ? b.to : b.from) ?? 0;
        return ja - jb;
      });
    for (const edge of outgoing) {
      usedEdges.add(edge);
      const target = position.get(edge.from === id ? edge.to : edge.from) ?? index + 1;
      steps.push({
        kind: 'edge',
        edge: EDGE_KINDS[edge.type] ?? 'derived',
        ...(edge.evidence ? { stance: str(edge.evidence) } : {}),
        ...(target > index + 1 ? { join: true } : {}),
      });
    }
  });
  return steps;
}

/** Is the OTHER end of `edge` upstream of `id`? (lineage.py directions:
 * `generated` activity→artifact, `used` artifact→activity — the FROM side
 * always feeds the TO side; `revision_of` newer→older, so the TO side is the
 * ancestor.) */
function upstreamOf(edge: LineageEdge, id: string): boolean {
  if (edge.type === 'revision_of') return edge.from === id;
  return edge.to === id;
}
