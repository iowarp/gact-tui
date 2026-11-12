import type {
  Artifact,
  ArtifactLineage,
  ArtifactLineageNode,
  ArtifactVersion,
} from '@clio/core/v3';
import type { ElkExtendedEdge, ElkNode, ElkPoint } from 'elkjs/lib/elk-api';
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
  /** The routed edge as SVG path data: right angles with rounded corners, between the nodes. */
  path: string;
}

type Placed = Omit<LineageGraphNode, 'x' | 'y' | 'width'>;

/** What the graph shows, before it is placed: its nodes and the links between them. */
export interface LineageSketch {
  nodes: readonly Placed[];
  links: readonly { from: string; to: string }[];
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
/**
 * With room to spare a node grows to show its whole name (its own estimated
 * width); this only bounds a pathological name.
 */
const NAMED_MAX_WIDTH = 640;
const RANK_GAP = 22;
/** The widest column gap a roomy pane spreads to: the shared graph gap (`GRAPH_GAP.max`). */
const WIDE_RANK_GAP = 56;
// Spec row pitch is about 94px: a 40px node plus 54px between stacked nodes.
const ROW_GAP = 54;
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

/** How far a layout spreads into its pane. The default is the compact drawing. */
export interface LineageSpread {
  /** Widest a node grows to show its name, in px; the compact `MAX_WIDTH` by default. */
  nameWidth?: number;
  /** Gap between columns, in px; the compact `RANK_GAP` by default. */
  rankGap?: number;
}

/**
 * The drawing for a pane `room` px wide. Names always show whole: the canvas zooms and
 * pans, so a drawing wider than its pane opens at its readable scale. With room to
 * spare, the columns spread toward the shared graph gap.
 */
export async function fitLineageLayout(
  build: (spread: LineageSpread) => Promise<LineageGraphLayout>,
  room: number | undefined,
): Promise<LineageGraphLayout> {
  const named = await build({ nameWidth: NAMED_MAX_WIDTH });
  if (!room || named.width >= room) return named;
  const wide = await build({ nameWidth: NAMED_MAX_WIDTH, rankGap: WIDE_RANK_GAP });
  if (wide.width <= room) return wide;
  // Each column gap adds to the width once per gap, so the width grows linearly with it.
  const perGap = (wide.width - named.width) / (WIDE_RANK_GAP - RANK_GAP);
  if (perGap <= 0) return named;
  const rankGap = Math.floor(RANK_GAP + (room - named.width) / perGap);
  const spread = await build({ nameWidth: NAMED_MAX_WIDTH, rankGap });
  return spread.width <= room ? spread : named;
}

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
  { earlier = 0, spread }: { earlier?: number; spread?: LineageSpread } = {},
): Promise<LineageGraphLayout> {
  return placeLineage(sketchArtifactLineage(artifact, lineage, { earlier }), spread);
}

/** The nodes and links `layoutArtifactLineage` places. */
export function sketchArtifactLineage(
  artifact: Artifact,
  lineage: ArtifactLineage,
  { earlier = 0 }: { earlier?: number } = {},
): LineageSketch {
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
    const frontier = depthFrontier(lineage, edges, placed);
    placed.push({
      id: CUT_SHORT,
      kind: 'gap',
      name: 'Cut short',
      detail: at,
      tip: `The service stopped the graph ${at}. ${frontier.upstream ? 'Older' : 'Later'} steps aren't shown.`,
    });
    // The break is drawn as an amber edge into the column where the walk stopped.
    for (const id of frontier.ids)
      edges.push(frontier.upstream ? { from: CUT_SHORT, to: id } : { from: id, to: CUT_SHORT });
  }
  return { nodes: placed, links: edges };
}

const CUT_SHORT = 'gap:cut-short';

/**
 * The nodes where the service stopped walking: those at the reported depth,
 * upstream first, or else the furthest the graph reaches. Custody gaps are
 * already breaks, so the cut joins the recorded steps beside them.
 */
function depthFrontier(
  lineage: ArtifactLineage,
  links: readonly { from: string; to: string }[],
  placed: readonly Placed[],
): { ids: string[]; upstream: boolean } {
  const kinds = new Map(placed.map((node) => [node.id, node.kind]));
  const recorded = links.filter(
    (link) => !link.from.startsWith('gap:') && !link.to.startsWith('gap:'),
  );
  const walk = (upstream: boolean) => {
    const distance = new Map([[lineage.root, 0]]);
    const queue = [lineage.root];
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      for (const link of recorded) {
        const next = upstream ? (link.to === id ? link.from : '') : link.from === id ? link.to : '';
        if (!next || distance.has(next)) continue;
        distance.set(next, (distance.get(id) ?? 0) + 1);
        queue.push(next);
      }
    }
    return distance;
  };
  const at = (distance: Map<string, number>, depth: number) => {
    const ids = [...distance].filter(([, value]) => value === depth).map(([id]) => id);
    const steps = ids.filter((id) => kinds.get(id) !== 'gap');
    return steps.length ? steps : ids;
  };
  const deepest = (distance: Map<string, number>) => Math.max(0, ...distance.values());
  const up = walk(true);
  const down = walk(false);
  const depth = lineage.truncated?.at_depth;
  if (depth !== undefined && depth > 0) {
    if (lineage.direction !== 'downstream' && at(up, depth).length)
      return { ids: at(up, depth), upstream: true };
    if (lineage.direction !== 'upstream' && at(down, depth).length)
      return { ids: at(down, depth), upstream: false };
  }
  const upstream =
    lineage.direction === 'upstream' ||
    (lineage.direction === 'both' && deepest(up) >= deepest(down));
  const distance = upstream ? up : down;
  return { ids: at(distance, deepest(distance)), upstream };
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
  spread: LineageSpread = {},
): Promise<LineageGraphLayout> {
  return placeLineage(sketchVersionChain(artifact, versions, current, now), spread);
}

/** The nodes and links `layoutVersionChain` places. */
export function sketchVersionChain(
  artifact: Artifact,
  versions: readonly ArtifactVersion[],
  current: number,
  now = Date.now(),
): LineageSketch {
  const ordered = [...versions].sort((left, right) => left.version - right.version);
  const placed = ordered.map((version): Placed => {
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
  return {
    nodes: placed,
    links: ordered.slice(1).map((version, index) => ({
      from: ordered[index].artifact_id,
      to: version.artifact_id,
    })),
  };
}

/** Files and actions in a sketch, for the frame bar's facts. */
export function lineageCounts(sketch: LineageSketch) {
  return {
    files: sketch.nodes.filter((node) => node.kind === 'file' || node.kind === 'self').length,
    actions: sketch.nodes.filter((node) => node.kind === 'action').length,
  };
}

type Elk = { layout: (graph: ElkNode) => Promise<ElkNode> };
let elk: Promise<Elk> | undefined;

/** ELK, loaded once on first use: its bundle is large and only the lineage graph needs it. */
function loadElk(): Promise<Elk> {
  elk ??= import('elkjs/lib/elk.bundled.js').then(({ default: ELK }) => new ELK());
  return elk;
}

/**
 * ELK's layered layout, left to right: it orders each column to keep edges from
 * crossing and routes every edge in right angles around the nodes. Siblings keep
 * the sketch's order where that costs no crossing, so the producing tool sits
 * above an outside edit that feeds the same file.
 */
const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.mergeEdges': 'false',
  'elk.spacing.nodeNode': String(ROW_GAP),
  'elk.spacing.edgeNode': '12',
  'elk.spacing.edgeEdge': '8',
  'elk.layered.spacing.edgeNodeBetweenLayers': '12',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '8',
  'elk.padding': `[top=12,left=${MARGIN},bottom=12,right=${MARGIN}]`,
} as const;

/** The corner radius of a routed edge, as the spec rounds its connectors. */
const CORNER = 6;

/** Places a sketch's nodes and routes its edges with ELK. */
export async function placeLineage(
  sketch: LineageSketch,
  spread: LineageSpread = {},
): Promise<LineageGraphLayout> {
  // Recorded steps come before gaps, so ELK's model order puts producers first.
  const placed = [...sketch.nodes].sort(
    (left, right) => Number(left.kind === 'gap') - Number(right.kind === 'gap'),
  );
  const widths = new Map(placed.map((node) => [node.id, nodeWidth(node, spread.nameWidth)]));
  const known = sketch.links.filter((link) => widths.has(link.from) && widths.has(link.to));
  const laid = await (
    await loadElk()
  ).layout({
    id: 'lineage',
    layoutOptions: {
      ...ELK_OPTIONS,
      'elk.layered.spacing.nodeNodeBetweenLayers': String(spread.rankGap ?? RANK_GAP),
    },
    children: placed.map((node) => ({
      id: node.id,
      width: widths.get(node.id),
      height: LINEAGE_NODE_HEIGHT,
    })),
    edges: known.map(
      (link, index): ElkExtendedEdge => ({
        id: `e${index}`,
        sources: [link.from],
        targets: [link.to],
      }),
    ),
  });
  const at = new Map((laid.children ?? []).map((child) => [child.id, child]));
  const nodes = sketch.nodes.map((node): LineageGraphNode => {
    const position = at.get(node.id);
    return {
      ...node,
      width: widths.get(node.id) ?? MIN_WIDTH,
      x: Math.round(position?.x ?? 0),
      y: Math.round(position?.y ?? 0),
    };
  });
  const kinds = new Map(nodes.map((node) => [node.id, node.kind]));
  const routes = new Map((laid.edges ?? []).map((edge) => [edge.id, edge]));
  const edges = known.map(
    (link, index): LineageGraphEdge => ({
      id: `${link.from}->${link.to}`,
      from: link.from,
      to: link.to,
      gap: kinds.get(link.from) === 'gap' || kinds.get(link.to) === 'gap',
      path: routedPath(routes.get(`e${index}`)),
    }),
  );
  const width = Math.ceil(laid.width ?? 0);
  const height = Math.ceil(laid.height ?? 0);
  return {
    nodes,
    edges,
    width,
    height,
    ...lineageCounts({ nodes, links: known }),
  };
}

/** One routed edge as path data: its right-angle route with rounded corners. */
function routedPath(edge: ElkExtendedEdge | undefined): string {
  const section = edge?.sections?.[0];
  if (!section) return '';
  const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
  // The arrowhead's tip lands on the node's border, not under it.
  const last = points.length - 1;
  points[last] = pullBack(points[last - 1]!, points[last]!, 1);
  let path = `M${round(points[0]!.x)},${round(points[0]!.y)}`;
  for (let index = 1; index < last; index++) {
    const before = points[index - 1]!;
    const corner = points[index]!;
    const after = points[index + 1]!;
    const radius = Math.min(
      CORNER,
      distance(before, corner) / 2,
      distance(corner, after) / 2,
    );
    const enter = pullBack(before, corner, radius);
    const leave = pullBack(after, corner, radius);
    path += ` L${round(enter.x)},${round(enter.y)} Q${round(corner.x)},${round(corner.y)} ${round(leave.x)},${round(leave.y)}`;
  }
  return `${path} L${round(points[last]!.x)},${round(points[last]!.y)}`;
}

const distance = (a: ElkPoint, b: ElkPoint) => Math.hypot(b.x - a.x, b.y - a.y);

/** The point `by` px short of `to`, on the way from `from`. */
function pullBack(from: ElkPoint, to: ElkPoint, by: number): ElkPoint {
  const length = distance(from, to);
  if (!length) return to;
  return { x: to.x - ((to.x - from.x) / length) * by, y: to.y - ((to.y - from.y) / length) * by };
}

const round = (value: number) => Math.round(value * 10) / 10;

function nodeWidth(node: Placed, cap = MAX_WIDTH): number {
  const text = Math.max(node.name.length * 6.6, node.detail.length * 5.6);
  return Math.round(Math.min(cap, Math.max(MIN_WIDTH, text + 42)));
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
