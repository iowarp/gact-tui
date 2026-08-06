/**
 * The node and edge components of the provenance data-flow graph (regrammar,
 * 2026-08-06).
 *
 * A node is still ONE line — glyph + name + muted sub-info chips + badges +
 * status pill — never a bordered kv rectangle. What the regrammar adds is the
 * transform's own identity ON the line rather than around it: the producing
 * agent's run label as a badge, and a `×N` multiplicity badge for a transform
 * the wire recorded N equivalent times, which expands to the per-run list.
 *
 * Every human-facing label here is a NAME (artifact name, tool name, agent run
 * label, session title). Raw `sess_`/`artifact_` ids appear only in `title`
 * hovers — the standing names-not-ids rule.
 */
import { useState } from 'react';
import { EdgeLabelRenderer, Handle, Position, BaseEdge, getSmoothStepPath } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { EdgeProps, NodeProps } from '@xyflow/react';
import { multiplicityLabel, nodeChips } from './lineageLayout';
import type { ProvEdge, ProvNode, ProvRun } from './provenanceModel';

const NODE_GLYPHS: Record<'artifact' | 'transform' | 'gap', string> = {
  artifact: '◆',
  transform: '⚙',
  gap: '▢',
};

/** How far left a back edge's own lane sits, so the loop never hides under
 *  the forward edge it mirrors. */
const BACK_EDGE_LANE_PX = 90;

export interface LineageNodeData extends Record<string, unknown> {
  prov: ProvNode;
  index: number;
  clusterId?: string;
  /** The producing agent's badge text — a run label, or the session name. */
  badgeText?: string;
  /** Hover context for the badge: which agent, in which session and turn. */
  producerTitle?: string;
  /** A run row's display name (run label, else session name). */
  runName: (run: ProvRun) => string;
  /** A run row's hover context (ids live here, and only here). */
  runTitle: (run: ProvRun) => string;
  onActivate?: () => void;
  activateTitle?: string;
  onOpenRun?: (run: ProvRun) => void;
  glossary: (term: string) => string | undefined;
}

export interface ClusterNodeData extends Record<string, unknown> {
  sessionId: string;
  /** The session's NAME — never the raw id, which rides the hover. */
  name: string;
  time: string;
  onOpenSession?: (sessionId: string) => void;
}

export interface LineageEdgeData extends Record<string, unknown> {
  prov: ProvEdge;
  index: number;
  clusterId?: string;
  glossary: (term: string) => string | undefined;
}

/**
 * ONE line per node. The whole line is the hit target when it has a real
 * destination; otherwise it renders inert — never a dead affordance.
 *
 * A COLLAPSED transform (multiplicity > 1) is deliberately not a line-level
 * click target: its runs happened in different sessions, so "open the
 * producing session" has no single honest answer. Its `×N` badge opens the run
 * list instead, and each run row is its own precise target.
 */
export function LineageNode({ data }: NodeProps) {
  const {
    prov,
    index,
    clusterId,
    badgeText,
    producerTitle,
    runName,
    runTitle,
    onActivate,
    activateTitle,
    onOpenRun,
    glossary,
  } = data as LineageNodeData;
  const [runsOpen, setRunsOpen] = useState(false);
  const node = prov.node;
  const chips = nodeChips(node);
  const multiplicity = multiplicityLabel(prov);

  const body = (
    <>
      <span className="detail__lglyph" data-nodetype={prov.kind} aria-hidden="true">
        {NODE_GLYPHS[prov.kind]}
      </span>
      <span className="detail__lname">{node.label}</span>
      {badgeText ? (
        <span className="detail__lbadge" data-testid="route-node-badge" title={producerTitle}>
          {badgeText}
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
    'data-multiplicity': multiplicity ? String(prov.multiplicity) : undefined,
  };

  return (
    <>
      <Handle id="in" type="target" position={Position.Top} className="detail__lhandle" isConnectable={false} />
      <Handle id="up" type="source" position={Position.Top} className="detail__lhandle" isConnectable={false} />
      <div className="detail__lrow">
        {onActivate ? (
          <button type="button" {...common} title={activateTitle} onClick={onActivate}>
            {body}
          </button>
        ) : (
          <div {...common}>{body}</div>
        )}
        {multiplicity ? (
          <button
            type="button"
            className="detail__lmult"
            data-testid="route-node-multiplicity"
            aria-expanded={runsOpen}
            title={`${prov.multiplicity} recorded runs produced identical output — click for the list`}
            onClick={() => setRunsOpen((open) => !open)}
          >
            {multiplicity}
          </button>
        ) : null}
        {multiplicity && runsOpen ? (
          <div className="detail__lruns" data-testid="route-node-runs">
            {prov.runs.map((run, at) => {
              // The ordinal is the run's own position in the recorded order —
              // the only thing that tells six identically-NAMED sessions apart
              // without putting their ids on screen.
              const rowBody = (
                <>
                  <span className="detail__lrunno" aria-hidden="true">
                    {at + 1}
                  </span>
                  {runName(run)}
                </>
              );
              return onOpenRun ? (
                <button
                  key={run.index}
                  type="button"
                  className="detail__lrun"
                  data-testid={`route-node-run-${at}`}
                  title={runTitle(run)}
                  onClick={() => onOpenRun(run)}
                >
                  {rowBody}
                </button>
              ) : (
                <span
                  key={run.index}
                  className="detail__lrun"
                  data-testid={`route-node-run-${at}`}
                  title={runTitle(run)}
                >
                  {rowBody}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
      <Handle id="out" type="source" position={Position.Bottom} className="detail__lhandle" isConnectable={false} />
      <Handle id="down" type="target" position={Position.Bottom} className="detail__lhandle" isConnectable={false} />
    </>
  );
}

/**
 * A genuinely foreign session's cluster: a dimmed bordered region holding the
 * contiguous nodes that session produced, with a one-line header naming it.
 * Without a navigation callback the header renders WITHOUT the ↗ — never a
 * dead affordance. The raw session id rides the hover only.
 */
export function ClusterNode({ data }: NodeProps) {
  const { sessionId, name, time, onOpenSession } = data as ClusterNodeData;
  const headBody = (
    <>
      <span className="detail__clusterdot" aria-hidden="true">
        ●
      </span>
      <span className="detail__clustersess">{name}</span>
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
          title={`Open session ${name} (${sessionId})`}
          onClick={() => onOpenSession(sessionId)}
        >
          {headBody}
        </button>
      ) : (
        <div className="detail__clusterhead" data-testid="route-cluster-header" title={sessionId}>
          {headBody}
        </div>
      )}
    </div>
  );
}

/**
 * An edge: the real connector path plus its `verb → evidence` label, evidence
 * teal. `data-usage` marks an outgoing use of the "you are here" artifact — the
 * usages the owner drew hanging below it. `×N` on the label says N recorded
 * edges collapsed here, so a multiplicity is never silently swallowed.
 */
export function LineageEdge({
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
  const { prov, index, clusterId, glossary } = data as unknown as LineageEdgeData;
  // A re-designation's two edges join the SAME pair of points in opposite
  // directions, so their paths and labels would land exactly on top of one
  // another. The back edge takes its own lane to the left, which is also what
  // makes it legible AS the loop it is.
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
    ...(prov.back ? { centerX: Math.min(sourceX, targetX) - BACK_EDGE_LANE_PX } : {}),
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className="detail__ledgepath"
        data-verb={prov.edge.edge}
      />
      <EdgeLabelRenderer>
        <div
          className="detail__ledge"
          data-testid={`route-edge-${index}`}
          data-join={prov.edge.join ? 'true' : undefined}
          data-usage={prov.usage ? 'true' : undefined}
          data-back={prov.back ? 'true' : undefined}
          data-cluster={clusterId}
          style={
            {
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            } as CSSProperties
          }
        >
          <span className="detail__ledgeverb" title={glossary(prov.edge.edge)}>
            {prov.edge.edge}
          </span>
          {prov.edge.stance ? (
            <>
              <span className="detail__ledgearrow" aria-hidden="true">
                →
              </span>
              <span className="detail__ledgeevidence" title={glossary(prov.edge.stance)}>
                {prov.edge.stance}
              </span>
            </>
          ) : null}
          {prov.multiplicity > 1 ? (
            <span
              className="detail__ledgemult"
              data-testid={`route-edge-mult-${index}`}
              title={`${prov.multiplicity} recorded edges, identical on both ends`}
            >
              ×{prov.multiplicity}
            </span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
