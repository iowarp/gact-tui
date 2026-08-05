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
  session_id?: string;
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

function nodeStep(node: LineageNode, selfId: string): RouteStep {
  if (node.type === 'activity') {
    const label = str(node.tool) || str(node.call_id) || node.id;
    const sub = [str(node.call_id), str(node.session_id)].filter(Boolean).join(' in ');
    return { kind: 'node', nodeType: 'activity', label, ...(sub ? { sub } : {}) };
  }
  const label = str(node.name) || node.id;
  const sub =
    node.type === 'gap'
      ? 'no transform recorded'
      : typeof node.version === 'number'
        ? `v${node.version}${node.id === selfId ? ' · this version' : ''}`
        : node.id === selfId
          ? 'this version'
          : '';
  return {
    kind: 'node',
    nodeType: 'artifact',
    label,
    ...(sub ? { sub } : {}),
    ...(node.id === selfId ? { self: true } : {}),
  };
}

/**
 * Flattens the lineage graph into the prototype's vertical chain: a
 * deterministic walk from the upstream-most inputs down to the root and on
 * through downstream derivations. Every node and edge appears exactly once —
 * a branchy graph lists siblings sequentially (the prototype's own treatment
 * of parallel inputs), never drops them.
 */
export function routeFromLineage(graph: LineageGraph): RouteStep[] {
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

  const usedEdges = new Set<LineageEdge>();
  const steps: RouteStep[] = [];
  order.forEach((id, index) => {
    const node = nodesById.get(id);
    if (!node) return;
    if (index > 0) {
      const prev = order[index - 1]!;
      const edge = graph.edges.find(
        (e) =>
          !usedEdges.has(e) &&
          ((e.from === prev && e.to === id) || (e.from === id && e.to === prev)),
      );
      if (edge) {
        usedEdges.add(edge);
        steps.push({
          kind: 'edge',
          edge: EDGE_KINDS[edge.type] ?? 'derived',
          ...(edge.evidence ? { stance: str(edge.evidence) } : {}),
        });
      }
    }
    steps.push(nodeStep(node, graph.root));
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
