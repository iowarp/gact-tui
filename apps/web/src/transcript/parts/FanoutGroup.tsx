import { useEffect, useState } from 'react';
import { StatusDot, type SessionStatus } from '../../kit';
import type { WirePart } from '../registry';
import { delegateStatus, formatDurationMs, metadataOf, type ChildPreview } from './HandoffPart';

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

export interface FanoutGroupProps {
  /** Every `expert_handoff` part sharing ONE `spawn_agents_parallel` call's
   *  `metadata.spawn_group_id` (wire contract: both the started AND
   *  completed stages of every sibling carry the same id, plus a fixed
   *  `metadata.group_size`) — Transcript's grouping pass hands these over
   *  already grouped; this component never re-derives membership from
   *  adjacency or timing. */
  parts: WirePart[];
  /** Same callback MergedHandoff uses — a fanout child opens exactly like a
   *  lone Call box (click -> center, shift-click -> right peek). */
  onOpenChild?: (handleId: string, agent: string, opts: { peek: boolean }) => void;
  /** Live child-session previews keyed by handle_id (SessionView's
   *  `childPreviews`) — same prop, same lookup MergedHandoff uses per child. */
  childPreviews?: Record<string, ChildPreview>;
}

function childAgentOf(part: WirePart): string {
  return str(part['child_agent'] ?? part['expert'] ?? part['agent']);
}

function handleIdOf(part: WirePart): string {
  return str(part['handle_id']);
}

function settledOf(part: WirePart): boolean {
  return str(part['stage']) !== 'delegate.started';
}

/** The group's declared total sibling count (`metadata.group_size`, fixed at
 *  spawn time on every sibling) — read off whichever part still carries it
 *  rather than assumed equal to how many siblings have streamed in so far,
 *  so the header names the real fanout width even before the last child
 *  part has arrived. Falls back to the rendered count only when no part
 *  carries the field (should not happen per contract, but never crashes). */
function groupSizeOf(parts: WirePart[]): number {
  for (const part of parts) {
    const raw = metadataOf(part)['group_size'];
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  }
  return parts.length;
}

interface FanoutRow {
  part: WirePart;
  child: string;
  runLabel: string;
  handleId: string;
  status: SessionStatus;
  question: string;
  durationRaw: number;
  preview: ChildPreview | undefined;
  running: boolean;
}

function buildRow(part: WirePart, childPreviews: FanoutGroupProps['childPreviews']): FanoutRow {
  const child = childAgentOf(part);
  const runLabel = str(part['run_label']);
  const handleId = handleIdOf(part);
  const settled = settledOf(part);
  const status = delegateStatus(part, settled);
  const question = str(metadataOf(part)['question']);
  const durationRaw = Number(part['duration_ms'] ?? 0);
  const preview = handleId ? childPreviews?.[handleId] : undefined;
  return { part, child, runLabel, handleId, status, question, durationRaw, preview, running: status === 'running' };
}

/** Same click/shift-click/keyboard contract MergedHandoff's box uses — one
 *  copy per interactive row kind in this codebase already (ChildCard and
 *  MergedHandoff each carry their own), so a third copy here matches the
 *  established idiom rather than reaching for a shared abstraction. */
function rowInteractive(
  onOpenChild: FanoutGroupProps['onOpenChild'],
  handleId: string,
  child: string,
  running: boolean,
) {
  if (!onOpenChild || !handleId) return {};
  return {
    role: 'button' as const,
    tabIndex: 0,
    title: running
      ? 'Open live agent · shift-click to peek in the side panel'
      : 'Open agent · shift-click to peek in the side panel',
    onClick: (e: { shiftKey: boolean }) => onOpenChild(handleId, child, { peek: Boolean(e.shiftKey) }),
    // Same guard as MergedHandoff/ChildCard: shift-mousedown's browser
    // default is "extend the native text selection", which must never fire
    // ahead of the peek click.
    onMouseDown: (e: { shiftKey: boolean; preventDefault: () => void }) => {
      if (e.shiftKey) e.preventDefault();
    },
    onKeyDown: (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpenChild(handleId, child, { peek: Boolean(e.shiftKey) });
      }
    },
    'data-interactive': 'true' as const,
  };
}

function footText(status: SessionStatus, duration: string): string {
  if (status === 'running') return `● running${duration ? ` (${duration})` : ''}`;
  if (status === 'error') return `failed ✗${duration ? ` ${duration}` : ''}`;
  return `completed ✓${duration ? ` ${duration}` : ''}`;
}

/**
 * The prototype's Call-box grammar, folded: N siblings of ONE
 * `spawn_agents_parallel` call render as ONE collapsible frame instead of N
 * ungrouped Call boxes (owner, round-7 live fan-out session: "three parallel
 * sibling children render as three ungrouped Call boxes"). Every child row
 * is clickable with the SAME semantics as a lone Call box — same
 * `onOpenChild` callback, same click/shift-click/keyboard contract —
 * whether the frame is expanded (a compact card per child: status, name,
 * handle, duration, and its own brief clamped to ~2 lines) or collapsed (a
 * one-line name/status/duration summary per child). Collapsing the FRAME
 * never removes a child's own click target — only its row's presentation
 * changes.
 */
export function FanoutGroup({ parts, onOpenChild, childPreviews }: FanoutGroupProps) {
  const [open, setOpen] = useState(true);

  const rows = parts.map((part) => buildRow(part, childPreviews));
  const total = groupSizeOf(parts);
  const names = Array.from(new Set(rows.map((r) => r.child).filter(Boolean)));
  const title = names.length === 1 ? `fanout(${names[0]} × ${total})` : `fanout(${total} agents)`;

  // ONE shared clock for the whole frame (not one interval per running
  // child) — every running row's elapsed reading ticks off the same `now`,
  // same idiom as MergedHandoff's own single-child clock.
  const anyLiveRunning = rows.some((r) => r.running && r.preview?.startedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anyLiveRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [anyLiveRunning]);

  const frameState: SessionStatus = rows.some((r) => r.status === 'error')
    ? 'error'
    : rows.some((r) => r.running)
      ? 'running'
      : 'idle';

  return (
    <div className="part-fanout" data-testid="part-fanout-group" data-state={frameState}>
      <button
        type="button"
        className="part-fanout__head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="part-fanout__chev" data-open={open ? 'true' : undefined} aria-hidden="true">
          ▸
        </span>
        <span className="part-fanout__title">{title}</span>
      </button>
      <div className="part-fanout__body">
        {rows.map((row) => {
          const startedAtMs = row.preview?.startedAt ? Date.parse(row.preview.startedAt) : NaN;
          const liveElapsedMs =
            row.running && Number.isFinite(startedAtMs) ? Math.max(0, now - startedAtMs) : undefined;
          const duration =
            (liveElapsedMs !== undefined ? formatDurationMs(liveElapsedMs) : '') ||
            formatDurationMs(row.durationRaw) ||
            str(row.part['duration'] ?? row.part['elapsed']);
          const interactive = rowInteractive(onOpenChild, row.handleId, row.child, row.running);
          const name = row.runLabel || row.child;
          const rowKey = row.handleId || `${row.child}:${row.runLabel}`;

          if (!open) {
            return (
              <div
                key={rowKey}
                className="part-fanout__line"
                data-testid="part-fanout-child"
                data-state={row.status}
                {...interactive}
              >
                <StatusDot status={row.status} quiet={row.status !== 'running'} />
                <span className="part-fanout__linename">{name}</span>
                <span className="part-fanout__linesep">·</span>
                <span className="part-fanout__linestatus" data-state={row.status}>
                  {row.status === 'running' ? 'running' : row.status === 'error' ? 'failed' : 'completed'}
                </span>
                {duration ? (
                  <>
                    <span className="part-fanout__linesep">·</span>
                    <span className="part-fanout__lineduration">{duration}</span>
                  </>
                ) : null}
              </div>
            );
          }

          return (
            <div
              key={rowKey}
              className="part-fanout__row"
              data-testid="part-fanout-child"
              data-state={row.status}
              {...interactive}
            >
              <div className="part-fanout__rowhead">
                <StatusDot status={row.status} quiet={row.status !== 'running'} />
                <span className="part-fanout__rowname">{name}</span>
                {row.handleId ? <span className="part-fanout__handle">{row.handleId}</span> : null}
                <span className="part-fanout__rowfoot" data-state={row.status}>
                  {footText(row.status, duration)}
                </span>
              </div>
              {row.question ? <p className="part-fanout__rowbrief">{row.question}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
