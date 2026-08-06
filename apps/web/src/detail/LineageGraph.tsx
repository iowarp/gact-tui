/**
 * The provenance lineage graph (viz rebuild, 2026-08) — React Flow (MIT) over
 * the deterministic dagre layout in `lineageGraph.ts`.
 *
 * Everything the approved design spec (docs/design/provenance-graph-2026-08.md)
 * settled is preserved verbatim: a node is ONE line (glyph + name + muted
 * sub-info chips + status pill), edges carry `verb → evidence` with the evidence
 * term in teal, foreign sessions group under a clickable cluster header, the
 * self node is anchored and highlighted, every provenance term keeps its
 * plain-words hover glossary, and clicks mean what they meant (artifact → push
 * the panel, activity → its producing session).
 *
 * What the library adds is what the hand-rolled rail could not do: pan and zoom,
 * a real layered layout, and true branch/merge geometry — a multi-input activity
 * now shows each input's edge converging on it, instead of a `╮` standing in for
 * a join the flat list could not draw.
 */
import { useMemo, type CSSProperties } from 'react';
import {
  BaseEdge,
  Background,
  BackgroundVariant,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutLineage, nodeChips } from './lineageLayout';
import type { RouteEdge, RouteNode, RouteStep } from './types';

/** Canvas height band. Small graphs stay compact; a long chain scrolls by
 *  panning rather than growing the panel past what a 320px column can hold. */
const MIN_CANVAS_PX = 168;
const MAX_CANVAS_PX = 440;

const NODE_GLYPHS: Record<RouteNode['nodeType'], string> = {
  artifact: '◆',
  activity: '⚙',
  gap: '▢',
};

export interface LineageGraphProps {
  route: RouteStep[];
  sessionTitles?: Record<string, string>;
  /** Plain-words hover expansion for a provenance vocabulary term. */
  glossary: (term: string) => string | undefined;
  /** Compact display name for a session reference (title + short id). */
  sessionLabel: (sessionId: string) => string;
  /** `2026-08-05T12:43:10Z` → `05 Aug 12:43`. */
  clusterTime: (iso: string) => string;
  onOpenSession?: (sessionId: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
}

interface LineageNodeData extends Record<string, unknown> {
  node: RouteNode;
  index: number;
  clusterId?: string;
  onActivate?: () => void;
  activateTitle?: string;
  glossary: (term: string) => string | undefined;
}

interface ClusterNodeData extends Record<string, unknown> {
  sessionId: string;
  label: string;
  time: string;
  onOpenSession?: (sessionId: string) => void;
}

interface LineageEdgeData extends Record<string, unknown> {
  edge: RouteEdge;
  index: number;
  clusterId?: string;
  glossary: (term: string) => string | undefined;
}

const nodeTypes = { lineage: LineageNode, cluster: ClusterNode };
const edgeTypes = { lineage: LineageEdge };

export function LineageGraph({
  route,
  sessionTitles: _sessionTitles,
  glossary,
  sessionLabel,
  clusterTime,
  onOpenSession,
  onOpenArtifact,
}: LineageGraphProps) {
  const layout = useMemo(() => layoutLineage(route), [route]);

  const nodes = useMemo<Node[]>(() => {
    // Cluster boxes come first so they paint BEHIND their members (React Flow
    // draws in array order within a z-index band).
    const clusterNodes: Node[] = layout.clusters.map((cluster) => ({
      id: cluster.id,
      type: 'cluster',
      position: { x: cluster.x, y: cluster.y },
      width: cluster.width,
      height: cluster.height,
      draggable: false,
      selectable: false,
      zIndex: 0,
      data: {
        sessionId: cluster.sessionId,
        label: sessionLabel(cluster.sessionId),
        time: cluster.createdAt ? clusterTime(cluster.createdAt) : '',
        ...(onOpenSession ? { onOpenSession } : {}),
      } satisfies ClusterNodeData,
    }));

    const stepNodes: Node[] = layout.nodes.map((entry) => {
      const node = entry.node;
      const onActivate =
        node.nodeType === 'artifact' && !node.self && node.artifactId && onOpenArtifact
          ? () => onOpenArtifact(node.artifactId!)
          : node.nodeType === 'activity' && node.sessionId && onOpenSession
            ? () => onOpenSession(node.sessionId!)
            : undefined;
      const activateTitle = onActivate
        ? node.nodeType === 'activity'
          ? `Open producing session ${sessionLabel(node.sessionId!)}`
          : 'Open artifact'
        : undefined;
      return {
        id: entry.id,
        type: 'lineage',
        position: { x: entry.x, y: entry.y },
        width: entry.width,
        height: entry.height,
        // Handles are DECLARED from the layout rather than left to React Flow's
        // DOM measurement. The layout already knows every node's exact box (it
        // computed it), so the attachment points are exact, edges never wait a
        // frame for a ResizeObserver, and the geometry is identical in the
        // browser and under jsdom — which is what makes it unit-testable.
        handles: [
          {
            type: 'target' as const,
            position: Position.Top,
            x: entry.width / 2,
            y: 0,
            width: 1,
            height: 1,
          },
          {
            type: 'source' as const,
            position: Position.Bottom,
            x: entry.width / 2,
            y: entry.height,
            width: 1,
            height: 1,
          },
        ],
        draggable: false,
        selectable: false,
        zIndex: 1,
        data: {
          node,
          index: entry.index,
          glossary,
          ...(entry.clusterId ? { clusterId: entry.clusterId } : {}),
          ...(onActivate ? { onActivate } : {}),
          ...(activateTitle ? { activateTitle } : {}),
        } satisfies LineageNodeData,
      };
    });

    return [...clusterNodes, ...stepNodes];
  }, [layout, sessionLabel, clusterTime, glossary, onOpenSession, onOpenArtifact]);

  const edges = useMemo<Edge[]>(() => {
    const clusterOf = new Map(layout.nodes.map((entry) => [entry.id, entry.clusterId]));
    return layout.edges.map((entry) => {
      const shared =
        clusterOf.get(entry.source) && clusterOf.get(entry.source) === clusterOf.get(entry.target)
          ? clusterOf.get(entry.source)
          : undefined;
      return {
        id: entry.id,
        type: 'lineage',
        source: entry.source,
        target: entry.target,
        zIndex: 2,
        data: {
          edge: entry.edge,
          index: entry.index,
          ...(shared ? { clusterId: shared } : {}),
          glossary,
        } satisfies LineageEdgeData,
      };
    });
  }, [layout, glossary]);

  const height = Math.min(MAX_CANVAS_PX, Math.max(MIN_CANVAS_PX, layout.height + 40));

  return (
    <div
      className="detail__lineage"
      data-testid="route-graph"
      style={{ height: `${height}px` }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        // A branchy graph is wider than a 320–720px panel, and letting fitView
        // scale it to fit would shrink the one-line node grammar past reading
        // size. The floor keeps the text legible and the user pans instead —
        // which is the whole point of having pan/zoom.
        fitViewOptions={{ padding: 0.08, minZoom: 0.72, maxZoom: 1 }}
        minZoom={0.4}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        aria-label="Lineage graph"
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} className="detail__lbg" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

/**
 * ONE line per node (spec rule 1): glyph + name + inline muted sub-info chips,
 * never a bordered rectangle. The whole line is the hit target when it has a
 * real destination; otherwise it renders inert — never a dead affordance.
 */
function LineageNode({ data }: NodeProps) {
  const { node, index, clusterId, onActivate, activateTitle, glossary } = data as LineageNodeData;
  const chips = nodeChips(node);
  const body = (
    <>
      <span className="detail__lglyph" data-nodetype={node.nodeType} aria-hidden="true">
        {NODE_GLYPHS[node.nodeType]}
      </span>
      <span className="detail__lname">{node.label}</span>
      {node.treeSession && node.runLabel ? (
        <span className="detail__lbadge" data-testid="route-node-badge" title={`Run: ${node.runLabel}`}>
          {node.runLabel}
        </span>
      ) : null}
      {chips.map((part, i) => (
        <span key={i} className="detail__lchip">
          {part}
        </span>
      ))}
      {node.status ? (
        <span className="detail__lpill" data-status={node.status} title={glossary(node.status)}>
          {node.status}
        </span>
      ) : null}
      {node.self ? <span className="detail__lselfmark">you are here</span> : null}
    </>
  );

  const testId = node.self ? 'route-node-self' : `route-node-${index}`;
  const common = {
    className: 'detail__lnode',
    'data-testid': testId,
    'data-self': node.self ? ('true' as const) : undefined,
    'data-cluster': clusterId,
  };

  return (
    <>
      <Handle type="target" position={Position.Top} className="detail__lhandle" isConnectable={false} />
      {onActivate ? (
        <button type="button" {...common} title={activateTitle} onClick={onActivate}>
          {body}
        </button>
      ) : (
        <div {...common}>{body}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="detail__lhandle" isConnectable={false} />
    </>
  );
}

/**
 * A foreign session's cluster (spec rule 3), now a real region rather than a
 * per-line `┆` glyph: a dimmed bordered box holding every node that session
 * produced, with a one-line header — `● <session> · 05 Aug 12:43 ↗` — as the
 * click target (jumps to that session, the same channel obs agent-navigation
 * uses). Without a navigation callback the header renders as a plain line
 * WITHOUT the ↗ — never a dead affordance.
 */
function ClusterNode({ data }: NodeProps) {
  const { sessionId, label, time, onOpenSession } = data as ClusterNodeData;
  const headBody = (
    <>
      <span className="detail__clusterdot" aria-hidden="true">
        ●
      </span>
      <span className="detail__clustersess" title={sessionId}>
        {label}
      </span>
      {time ? <span className="detail__clustertime">{time}</span> : null}
      {onOpenSession ? (
        <span className="detail__clustergo" aria-hidden="true">
          ↗
        </span>
      ) : null}
    </>
  );
  return (
    <div className="detail__cluster" data-testid="route-cluster" data-session={sessionId}>
      {onOpenSession ? (
        <button
          type="button"
          className="detail__clusterhead"
          data-testid="route-cluster-header"
          title={`Open session ${sessionId}`}
          onClick={() => onOpenSession(sessionId)}
        >
          {headBody}
        </button>
      ) : (
        <div className="detail__clusterhead" data-testid="route-cluster-header">
          {headBody}
        </div>
      )}
    </div>
  );
}

/**
 * An edge: the real connector path plus its `verb → evidence` label (spec rule
 * 2), the evidence term teal. `data-join` still marks an edge whose consumer is
 * not the immediately following line — but the geometry now DRAWS the join
 * instead of standing in for it with a `╮`, so multi-input activities read as
 * real converging branches.
 */
function LineageEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const { edge, index, clusterId, glossary } = data as unknown as LineageEdgeData;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className="detail__ledgepath"
        data-verb={edge.edge}
      />
      <EdgeLabelRenderer>
        <div
          className="detail__ledge"
          data-testid={`route-edge-${index}`}
          data-join={edge.join ? 'true' : undefined}
          data-cluster={clusterId}
          style={
            {
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            } as CSSProperties
          }
        >
          <span className="detail__ledgeverb" title={glossary(edge.edge)}>
            {edge.edge}
          </span>
          {edge.stance ? (
            <>
              <span className="detail__ledgearrow" aria-hidden="true">
                →
              </span>
              <span className="detail__ledgeevidence" title={glossary(edge.stance)}>
                {edge.stance}
              </span>
            </>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
