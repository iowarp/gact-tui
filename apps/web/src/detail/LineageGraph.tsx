/**
 * The provenance data-flow graph (regrammar, owner sketch 2026-08-06) — React
 * Flow (MIT) over the deterministic dagre layout in `lineageLayout.ts`.
 *
 * The structure is `artifact → transform → artifact`: transforms are
 * first-class nodes, every input's edge converges into the transform that
 * consumed it, and the transform's `generated` edge lands on the artifact it
 * produced. Agent identity is a BADGE on the transform, not a box around it;
 * only a genuinely foreign session (outside this session's tree) still gets a
 * light cluster box. N recorded re-derivations that the wire says produced the
 * same bytes from the same inputs collapse to ONE node carrying `×N`, which
 * expands to the per-run list.
 *
 * Preserved verbatim from the approved spec: one-line minimal nodes, the
 * ◆ ⚙ ▢ glyph vocabulary, `verb → evidence` edge labels with the evidence term
 * teal, reproducible/gap pills, the anchored highlighted self node, plain-words
 * glossary hovers, and the click semantics (artifact → push the panel, activity
 * → its producing session).
 */
import { useCallback, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutLineage, nodeBadges, type ProducerBadge } from './lineageLayout';
import { ClusterNode, LineageEdge, LineageNode } from './LineageNodes';
import type { ClusterNodeData, LineageEdgeData, LineageNodeData } from './LineageNodes';
import type { ProvRun } from './provenanceModel';
import type { RouteStep } from './types';

/** Canvas height band. Small graphs stay compact; a long chain scrolls by
 *  panning rather than growing the panel past what a 320px column can hold. */
const MIN_CANVAS_PX = 168;
const MAX_CANVAS_PX = 440;

export interface LineageGraphProps {
  route: RouteStep[];
  /** Plain-words hover expansion for a provenance vocabulary term. */
  glossary: (term: string) => string | undefined;
  /** A session's display NAME (title, else an honest fallback). Raw ids are
   *  never part of it — they ride `title` hovers only. */
  sessionName: (sessionId: string) => string;
  /** `2026-08-05T12:43:10Z` → `05 Aug 12:43`. */
  clusterTime: (iso: string) => string;
  onOpenSession?: (sessionId: string) => void;
  onOpenArtifact?: (artifactId: string) => void;
}

const nodeTypes = { lineage: LineageNode, cluster: ClusterNode };
const edgeTypes = { lineage: LineageEdge };

export function LineageGraph({
  route,
  glossary,
  sessionName,
  clusterTime,
  onOpenSession,
  onOpenArtifact,
}: LineageGraphProps) {
  // The producing agent's badge: its agent-task run label when the session is
  // in this session's tree, else the foreign session's own name. Never an id.
  const badge = useCallback<ProducerBadge>(
    (producer) => producer.runLabel ?? (producer.sessionId ? sessionName(producer.sessionId) : undefined),
    [sessionName],
  );
  const runName = useCallback(
    (run: ProvRun) => run.runLabel ?? (run.sessionId ? sessionName(run.sessionId) : 'unnamed run'),
    [sessionName],
  );
  // Ids live HERE and only here (names-not-ids), together with the parent-turn
  // context the owner asked a transform to carry.
  const runTitle = useCallback(
    (run: ProvRun) =>
      [
        `Run ${runName(run)}`,
        run.sessionId ? `session ${run.sessionId}` : '',
        run.turnId ? `turn ${run.turnId}` : '',
      ]
        .filter(Boolean)
        .join(' — '),
    [runName],
  );

  const layout = useMemo(() => layoutLineage(route, badge), [route, badge]);

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
        name: sessionName(cluster.sessionId),
        time: cluster.createdAt ? clusterTime(cluster.createdAt) : '',
        ...(onOpenSession ? { onOpenSession } : {}),
      } satisfies ClusterNodeData,
    }));

    const stepNodes: Node[] = layout.nodes.map((entry) => {
      const node = entry.node;
      const prov = entry.prov;
      // A collapsed transform has no ONE producing session, so the line is not
      // a session affordance — its run rows are.
      const single = prov.multiplicity === 1;
      const onActivate =
        prov.kind === 'artifact' && !node.self && node.artifactId && onOpenArtifact
          ? () => onOpenArtifact(node.artifactId!)
          : prov.kind === 'transform' && single && node.sessionId && onOpenSession
            ? () => onOpenSession(node.sessionId!)
            : undefined;
      const activateTitle = onActivate
        ? prov.kind === 'transform'
          ? `Open producing session ${sessionName(node.sessionId!)} (${node.sessionId})`
          : 'Open artifact'
        : undefined;
      const badges = nodeBadges(prov, badge);
      const badgeText = prov.producer && !prov.clusterId ? badge(prov.producer) : undefined;
      const producerTitle =
        prov.producer && badgeText ? runTitle({ index: entry.index, ...prov.producer }) : undefined;
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
          { id: 'in', type: 'target' as const, position: Position.Top, x: entry.width / 2, y: 0, width: 1, height: 1 },
          { id: 'up', type: 'source' as const, position: Position.Top, x: entry.width / 2, y: 0, width: 1, height: 1 },
          {
            id: 'out',
            type: 'source' as const,
            position: Position.Bottom,
            x: entry.width / 2,
            y: entry.height,
            width: 1,
            height: 1,
          },
          {
            id: 'down',
            type: 'target' as const,
            position: Position.Bottom,
            x: entry.width / 2,
            y: entry.height,
            width: 1,
            height: 1,
          },
        ],
        draggable: false,
        selectable: false,
        // A collapsed transform can open a run list that floats over its
        // neighbours, so its whole node rides above them; every other line
        // shares one band and paints in route order.
        zIndex: prov.multiplicity > 1 ? 5 : 1,
        data: {
          prov,
          index: entry.index,
          glossary,
          runName,
          runTitle,
          ...(badges.length > 0 && badgeText ? { badgeText } : {}),
          ...(producerTitle ? { producerTitle } : {}),
          ...(entry.clusterId ? { clusterId: entry.clusterId } : {}),
          ...(onActivate ? { onActivate } : {}),
          ...(activateTitle ? { activateTitle } : {}),
          ...(onOpenSession
            ? { onOpenRun: (run: ProvRun) => run.sessionId && onOpenSession(run.sessionId) }
            : {}),
        } satisfies LineageNodeData,
      };
    });

    return [...clusterNodes, ...stepNodes];
  }, [layout, sessionName, clusterTime, glossary, onOpenSession, onOpenArtifact, badge, runName, runTitle]);

  const edges = useMemo<Edge[]>(() => {
    const clusterOf = new Map(layout.nodes.map((entry) => [entry.id, entry.clusterId]));
    return layout.edges.map((entry) => {
      const shared =
        clusterOf.get(entry.source) && clusterOf.get(entry.source) === clusterOf.get(entry.target)
          ? clusterOf.get(entry.source)
          : undefined;
      // A back edge (the wire's re-designation: the same transform used AND
      // generated one artifact) attaches top→bottom so it reads as the loop it
      // is, instead of crossing the whole drawing.
      const back = entry.prov.back === true;
      return {
        id: entry.id,
        type: 'lineage',
        source: entry.source,
        target: entry.target,
        sourceHandle: back ? 'up' : 'out',
        targetHandle: back ? 'down' : 'in',
        zIndex: 2,
        data: {
          prov: entry.prov,
          index: entry.index,
          ...(shared ? { clusterId: shared } : {}),
          glossary,
        } satisfies LineageEdgeData,
      };
    });
  }, [layout, glossary]);

  const height = Math.min(MAX_CANVAS_PX, Math.max(MIN_CANVAS_PX, layout.height + 40));

  return (
    <div className="detail__lineage" data-testid="route-graph" style={{ height: `${height}px` }}>
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
