import type {
  Artifact,
  ArtifactLineage,
  ArtifactLineageNode,
  ArtifactVersion,
} from '@clio/core/v3';
import { graphlib, layout } from '@dagrejs/dagre';
import { vocab } from '@/lib/brand-vocabulary';
import { formatBytes } from '@/lib/format';

export type LineageNodeKind = 'file' | 'action' | 'gap' | 'self';

/** One node as the graph draws it: a name, one short line, and what opening it does. */
export interface LineageGraphNode {
  id: string;
  kind: LineageNodeKind;
  name: string;
  detail: string;
  /** The hover line under the name. */
  tip: string;
  /** Earlier versions stacked behind the current node. */
  stacked?: boolean;
  /** Choosing it unfolds or folds the versions. */
  folds?: boolean;
  x: number;
  y: number;
  width: number;
  artifact?: Artifact;
  callId?: string;
  tool?: string;
  sessionId?: string;
}

export interface LineageGraphEdge {
  id: string;
  from: string;
  to: string;
  gap: boolean;
  path: string;
}

export interface LineageGraphLayout {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
  width: number;
  height: number;
  files: number;
  actions: number;
}

export const LINEAGE_NODE_HEIGHT = 40;
const MIN_WIDTH = 96;
const MAX_WIDTH = 116;
const RANK_GAP = 22;
const ROW_GAP = 40;
const MARGIN = 10;

const OK_STATES = new Set(['ok', 'success', 'succeeded', 'completed', 'done']);

/** "40m", "2h", "3d": the age a node can show in its short line. */
export function shortAge(iso: string | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(at)) return '';
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

type Placed = Omit<LineageGraphNode, 'x' | 'y' | 'width'>;

/** A node that does something when chosen. */
export function canOpenLineageNode(node: LineageGraphNode) {
  return node.kind === 'self' ? Boolean(node.folds) : Boolean(node.artifact || node.callId);
}

/**
 * Lays out what the service recorded: files and actions left to right, the
 * current file marked, its earlier versions stacked behind it, and an amber
 * gap wherever the record breaks.
 */
export function layoutArtifactLineage(
  artifact: Artifact,
  lineage: ArtifactLineage,
  { earlier = 0 }: { earlier?: number } = {},
): LineageGraphLayout {
  const byId = new Map(lineage.nodes.map((node) => [node.id, node]));
  const root = byId.get(lineage.root);
  const rootName = (root && stringField(root, 'name')) || artifact.name;
  // Earlier versions are the stack behind the current node, not separate nodes.
  const versionIds = new Set(
    lineage.edges
      .filter((edge) => edge.type === 'revision_of')
      .flatMap((edge) => [edge.from, edge.to])
      .filter((id) => id !== lineage.root && stringField(byId.get(id), 'name') === rootName),
  );
  const placed: Placed[] = [];
  for (const node of lineage.nodes) {
    if (versionIds.has(node.id)) continue;
    placed.push(describeNode(node, node.id === lineage.root, artifact, earlier));
  }
  if (!root) placed.push(selfFallback(artifact, lineage.root, earlier));
  const edges = lineage.edges
    .filter(
      (edge) =>
        edge.type !== 'revision_of' && !versionIds.has(edge.from) && !versionIds.has(edge.to),
    )
    .map((edge) => ({ from: edge.from, to: edge.to }));
  if (!edges.length && placed.length === 1) {
    placed.unshift({
      id: 'gap:no-record',
      kind: 'gap',
      name: 'No recorded source',
      detail: `not made in ${vocab.agent}`,
      tip: `${vocab.agent} has no record of what made this file.`,
    });
    edges.push({ from: 'gap:no-record', to: lineage.root });
  }
  if (lineage.truncated) {
    const at =
      lineage.truncated.at_depth !== undefined
        ? `at depth ${lineage.truncated.at_depth}`
        : lineage.truncated.nodes !== undefined
          ? `at ${lineage.truncated.nodes} nodes`
          : 'bounded';
    placed.push({
      id: 'gap:cut-short',
      kind: 'gap',
      name: 'Cut short',
      detail: at,
      tip: `The service stopped the graph ${at}. Older steps aren't shown.`,
    });
  }
  return layoutNodes(placed, edges);
}

function describeNode(
  node: ArtifactLineageNode,
  self: boolean,
  fallback: Artifact,
  earlier: number,
): Placed {
  if (node.type === 'activity') {
    const tool = stringField(node, 'tool') || 'Recorded action';
    const status = stringField(node, 'status');
    const failed = status !== '' && !OK_STATES.has(status.toLowerCase());
    return {
      id: node.id,
      kind: 'action',
      name: tool,
      detail: failed ? status : 'ran',
      tip: `${failed ? `Ended ${status}` : `Ran by ${vocab.agent}`}. Opens in Activity.`,
      callId: stringField(node, 'call_id') || node.id.replace(/^activity:/u, ''),
      tool,
      sessionId: stringField(node, 'session_id') || undefined,
    };
  }
  const name = stringField(node, 'name') || 'Artifact';
  const version = numberField(node, 'version');
  const size = numberField(node, 'size_bytes') ?? numberField(node, 'size');
  if (node.type === 'gap' || node.custody_gap) {
    return {
      id: node.id,
      kind: 'gap',
      name: 'Edited outside',
      detail: name,
      tip: `${name} changed outside ${vocab.agent}, so the record breaks here. Opens the file.`,
      artifact: self ? undefined : artifactFromNode(node, fallback),
    };
  }
  const versionText = version ? `v${version}` : '';
  if (self) {
    return {
      id: node.id,
      kind: 'self',
      name,
      detail: [versionText, earlier ? `${earlier} earlier` : sizeText(size)]
        .filter(Boolean)
        .join(', '),
      tip: earlier
        ? `This file. Its ${earlier === 1 ? 'earlier version is' : `${earlier} earlier versions are`} stacked behind it.`
        : 'This file.',
      stacked: earlier > 0,
      folds: earlier > 0,
    };
  }
  return {
    id: node.id,
    kind: 'file',
    name,
    detail: [versionText, sizeText(size)].filter(Boolean).join(', '),
    tip: 'Opens in a tab.',
    artifact: artifactFromNode(node, fallback),
  };
}

function selfFallback(artifact: Artifact, id: string, earlier: number): Placed {
  return {
    id,
    kind: 'self',
    name: artifact.name,
    detail: earlier ? `${earlier} earlier` : '',
    tip: 'This file.',
    stacked: earlier > 0,
    folds: earlier > 0,
  };
}

function sizeText(size: number | undefined) {
  return size ? formatBytes(size) : '';
}

/**
 * The "revision of" chain, unfolded from the current node's stack: oldest
 * first, each with its age and who made it.
 */
export function layoutVersionChain(
  artifact: Artifact,
  versions: readonly ArtifactVersion[],
  current: number,
  now = Date.now(),
): LineageGraphLayout {
  const ordered = [...versions].sort((left, right) => left.version - right.version);
  const placed = ordered.map((version): Omit<LineageGraphNode, 'x' | 'y' | 'width'> => {
    const self = version.version === current;
    const tool = typeof version.producer['tool'] === 'string' ? version.producer['tool'] : '';
    const by = version.custody_gap ? `outside ${vocab.agent}` : tool || vocab.agent;
    const age = shortAge(version.created_at, now);
    return {
      id: version.artifact_id,
      kind: self ? 'self' : version.custody_gap ? 'gap' : 'file',
      name: `v${version.version}`,
      detail: [age, by].filter(Boolean).join(', '),
      tip: self
        ? 'This version. Choose it to fold the versions back.'
        : `Made by ${by}${age ? `, ${age} ago` : ''}. Opens this version in a tab.`,
      stacked: undefined,
      folds: self ? true : undefined,
      artifact: self
        ? undefined
        : {
            ...artifact,
            id: version.artifact_id,
            name: version.name,
            uri: version.uri,
            version: version.version,
            sha256: version.sha256,
            size: version.size_bytes,
            created_at: version.created_at,
          },
    };
  });
  return layoutNodes(
    placed,
    ordered.slice(1).map((version, index) => ({
      from: ordered[index].artifact_id,
      to: version.artifact_id,
    })),
  );
}

/** Places the nodes with dagre and draws each edge as one curve, right side to left side. */
export function layoutNodes(
  placed: readonly Omit<LineageGraphNode, 'x' | 'y' | 'width'>[],
  links: readonly { from: string; to: string }[],
): LineageGraphLayout {
  const graph = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'LR',
    nodesep: ROW_GAP,
    ranksep: RANK_GAP,
    marginx: MARGIN,
    marginy: 12,
  });
  const widths = new Map(placed.map((node) => [node.id, nodeWidth(node)]));
  for (const node of placed)
    graph.setNode(node.id, { width: widths.get(node.id), height: LINEAGE_NODE_HEIGHT });
  const known = links.filter((link) => widths.has(link.from) && widths.has(link.to));
  for (const link of known) graph.setEdge(link.from, link.to);
  layout(graph);
  const nodes = placed.map((node): LineageGraphNode => {
    const position = graph.node(node.id);
    const width = widths.get(node.id) ?? MIN_WIDTH;
    return {
      ...node,
      width,
      x: Math.round(position.x - width / 2),
      y: Math.round(position.y - LINEAGE_NODE_HEIGHT / 2),
    };
  });
  const at = new Map(nodes.map((node) => [node.id, node]));
  const edges = known.map((link): LineageGraphEdge => {
    const from = at.get(link.from)!;
    const to = at.get(link.to)!;
    const x1 = from.x + from.width;
    const y1 = from.y + LINEAGE_NODE_HEIGHT / 2;
    const x2 = to.x - 3;
    const y2 = to.y + LINEAGE_NODE_HEIGHT / 2;
    const bend = Math.max(12, (x2 - x1) / 2);
    return {
      id: `${link.from}->${link.to}`,
      from: link.from,
      to: link.to,
      gap: from.kind === 'gap' || to.kind === 'gap',
      path: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`,
    };
  });
  const width = Math.max(0, ...nodes.map((node) => node.x + node.width)) + MARGIN + 12;
  const height = Math.max(0, ...nodes.map((node) => node.y + LINEAGE_NODE_HEIGHT)) + 24;
  return {
    nodes,
    edges,
    width,
    height,
    files: nodes.filter((node) => node.kind === 'file' || node.kind === 'self').length,
    actions: nodes.filter((node) => node.kind === 'action').length,
  };
}

function nodeWidth(node: Placed): number {
  const text = Math.max(node.name.length * 6.6, node.detail.length * 5.6);
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, text + 42)));
}

export function artifactFromNode(node: ArtifactLineageNode, fallback: Artifact): Artifact {
  return {
    id: node.id,
    session_id: stringField(node, 'session_id') || fallback.session_id,
    workspace_id: stringField(node, 'workspace_id') || fallback.workspace_id,
    name: stringField(node, 'name') || 'Artifact',
    media_type: stringField(node, 'media_type') || 'application/octet-stream',
    uri: stringField(node, 'uri') || `artifact://${node.id}`,
    fetch_path: stringField(node, 'fetch_path') || undefined,
    custody: stringField(node, 'custody') || undefined,
    sha256: stringField(node, 'sha256') || undefined,
    size: numberField(node, 'size_bytes'),
    created_at: stringField(node, 'created_at') || undefined,
  };
}

function stringField(node: ArtifactLineageNode | undefined, key: string): string {
  const value = node?.[key];
  return typeof value === 'string' ? value : '';
}

function numberField(node: ArtifactLineageNode, key: string): number | undefined {
  const value = node[key];
  return typeof value === 'number' ? value : undefined;
}
