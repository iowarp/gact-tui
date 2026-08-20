import { useEffect, useState } from 'react';
import {
  fetchSessionAsyncProcesses,
  subscribeSessionAsyncProcessEvents,
  type Client,
  type SessionAsyncProcess,
} from '@clio/core';
import { StatusDot, type SessionStatus } from '../../kit';
import { isRecord, stringValue, truncate } from '../../wire/presentationUtils';
import type { WirePart } from '../registry';
import { extractStructuredContent, extractToolResultText } from './toolResultText';
import { sanitizeTitle } from './titleSanitizer';
import { formatDurationMs } from './HandoffPart';
import './runcard.css';

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

/**
 * The RUN CARD (gact-tui#370): a boxed transcript object for a curated
 * relay/cluster run tool call — the "run" being created on the UI, click-to-
 * expand, that an agent polls through the same MCP task record a human
 * watches (owner ruling, 2026-08-19).
 *
 * Mirrors ToolPart's card grammar (collapsed head, chevron, expandable well)
 * and McpTaskPeekView's live-refresh idiom (fetch + SSE subscribe + poll
 * backstop, #1205) as its OWN seam rather than growing either file further
 * (no-accretion, gact-change-control §3).
 *
 * Curated the same way `wait_agent_tasks`/`check_agent_tasks` are curated in
 * ToolPart (a small explicit tool-name set, never duck-typed) — seeded with
 * the one real curated relay-run submission tool today
 * (`jarvis_run` -> "Run Pipeline", clio_agent.tools.jarvis_jobs).
 */
const RELAY_RUN_TOOL_NAMES = new Set(['jarvis_run']);

/** Human titles for the curated set — used when the wire hasn't stamped a
 *  `tool_title` (older sessions). Never the raw tool name verbatim. */
const RELAY_RUN_TITLES: Record<string, string> = {
  jarvis_run: 'Run Pipeline',
};

/** Whether `call` is a curated relay/cluster run submission — the gate
 *  Transcript uses to route a tool group through this card instead of the
 *  generic ToolPart. */
export function isRelayRunCall(call: WirePart): boolean {
  return RELAY_RUN_TOOL_NAMES.has(str(call['tool_name'] ?? call['name']));
}

const RECONCILE_INTERVAL_MS = 5000;
/** Rendered console is bounded by the record's own byte cap
 *  (relay_console.py's `console_tail_cap_bytes`, ~8 KiB default) — this is
 *  just the visible viewport height, not a second truncation. */
const CONSOLE_VIEWPORT_LINES = 12;

export type RunPhase = 'queued' | 'running' | 'waiting_for_input' | 'completed' | 'failed' | 'cancelled';

export interface RunVerdict {
  phase: RunPhase;
  dot: SessionStatus;
  /** A typed, human reason for a failed/cancelled verdict. Disclosed on
   *  hover (chip `title`) and in the expanded well — never inline noise in
   *  the collapsed header (house rule: reasons are hover-or-expand only). */
  reason?: string;
  /** A raw, non-terminal application phase word (e.g. "deploying") carried
   *  alongside the fixed `phase` vocabulary — surfaced, never discarded,
   *  but never allowed to invent one of the fixed phases on its own. */
  detail?: string;
}

const PHASE_LABEL: Record<RunPhase, string> = {
  queued: 'queued',
  running: 'running',
  waiting_for_input: 'waiting for input',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

/**
 * Verdict rung 1: the tool_call's OWN result. `jarvis_run` (the confirmed
 * curated submission tool, clio_agent.tools.jarvis_jobs.JarvisRunHandle)
 * returns almost immediately with a queued HANDLE
 * (`{task_id, job_id, kind:"jarvis", state:"queued", terminal:false}`), not
 * a terminal outcome — but this rung also recognizes the JARVIS execution
 * contract's own terminal shape
 * (`clio_agent.tools.jarvis_result_contract.execution_projection`:
 * `{state, terminal, error, return_code, ...}`) so a future bounded result
 * on this same tool renders correctly with no client change.
 *
 * Honesty caveat #1 (owner ruling): a `state`/`error`/`return_code` inside
 * an otherwise successful (`is_error` false) result means the APPLICATION
 * failed even though the CALL delivered — this is checked ahead of, and
 * independently from, `is_error` and any MCP-protocol status.
 */
function verdictFromResult(result: WirePart | undefined): RunVerdict | null {
  if (!result) return null;
  if (result['is_error'] === true) {
    const message = truncate(extractToolResultText(result), 240).trim();
    return { phase: 'failed', dot: 'error', reason: message || 'the call reported an error' };
  }
  const payload = extractStructuredContent(result);
  if (!isRecord(payload)) return null;
  const state = typeof payload['state'] === 'string' ? payload['state'].trim().toLowerCase() : '';
  const errorText = typeof payload['error'] === 'string' && payload['error'].trim() ? payload['error'].trim() : null;
  const returnCode = typeof payload['return_code'] === 'number' ? payload['return_code'] : null;
  if (errorText || (returnCode !== null && returnCode !== 0)) {
    return { phase: 'failed', dot: 'error', reason: errorText ?? `exited with code ${returnCode}` };
  }
  if (state === 'failed' || state === 'error') {
    return { phase: 'failed', dot: 'error', reason: `the pipeline reported state "${state}"` };
  }
  if (state === 'cancelled' || state === 'canceled') {
    return { phase: 'cancelled', dot: 'idle' };
  }
  if (state === 'completed' || payload['terminal'] === true) {
    return { phase: 'completed', dot: 'idle' };
  }
  if (state === 'queued') {
    return { phase: 'queued', dot: 'queued' };
  }
  if (state) {
    // An unrecognized non-terminal application word (e.g. "deploying") —
    // still a live run; the word itself is kept as `detail` rather than
    // silently discarded or promoted into a guessed fixed phase.
    return { phase: 'running', dot: 'running', detail: state };
  }
  return null;
}

/** Mirrors clio-agent routes/async_processes.py's `_MCP_TASK_LIVE_STATES` —
 *  a deliberately separate local copy, same reasoning McpTaskPeekView's own
 *  copy documents (the two projections are free to diverge). */
const MCP_STATUS_PHASE: Record<string, RunPhase> = {
  working: 'running',
  input_required: 'waiting_for_input',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

const PHASE_DOT: Record<RunPhase, SessionStatus> = {
  queued: 'queued',
  running: 'running',
  waiting_for_input: 'queued',
  completed: 'idle',
  failed: 'error',
  cancelled: 'idle',
};

/**
 * Verdict rung 2: the session's live async-processes record (#1205),
 * correlated by task id. Prefers an `effective_status` field when present
 * (the server-side field landing in parallel, owner ruling honesty caveat
 * #1) over the MCP-protocol `status` — falls back to `status` when absent.
 * `null` when the record carries neither a recognized `effective_status`
 * nor a recognized `status` — never a guessed phase.
 */
function verdictFromLiveRecord(record: SessionAsyncProcess | undefined): RunVerdict | null {
  if (!record) return null;
  const effective =
    typeof record['effective_status'] === 'string' ? (record['effective_status'] as string).trim().toLowerCase() : '';
  const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
  const phase = MCP_STATUS_PHASE[effective] ?? MCP_STATUS_PHASE[status];
  if (!phase) return null;
  const reason =
    phase === 'failed'
      ? (typeof record['holding_reason'] === 'string' && record['holding_reason']) ||
        'the task ended in a failed state'
      : undefined;
  return { phase, dot: PHASE_DOT[phase], ...(reason ? { reason } : {}) };
}

/**
 * Merges the call/result snapshot with the live record: a FAILED (or
 * CANCELLED) verdict from EITHER source always wins over a clean one from
 * the other (owner ruling honesty caveat #1 — never render green over a
 * failed run), regardless of which source is "more terminal". Otherwise the
 * live record wins as the fresher source; the static result is the fallback
 * when no live record was ever found (e.g. this tool's task never reached
 * the durable store, or `client`/`sessionId` were not wired at this call
 * site) — a real, honest snapshot, never fabricated.
 */
function computeVerdict(result: WirePart | undefined, liveRecord: SessionAsyncProcess | undefined): RunVerdict {
  const fromResult = verdictFromResult(result);
  const fromLive = verdictFromLiveRecord(liveRecord);
  const candidates = [fromResult, fromLive].filter((v): v is RunVerdict => v !== null);
  const failed = candidates.find((v) => v.phase === 'failed');
  if (failed) return failed;
  const cancelled = candidates.find((v) => v.phase === 'cancelled');
  if (cancelled) return cancelled;
  if (fromLive) return fromLive;
  if (fromResult) return fromResult;
  return { phase: 'queued', dot: 'queued' };
}

function taskIdOf(record: SessionAsyncProcess): string {
  const key = record['key'] as { task_id?: unknown } | undefined;
  return typeof key?.task_id === 'string' ? key.task_id : record.id;
}

/**
 * Live task-record subscription, keyed by `taskId` — the SAME
 * fetch + SSE-subscribe + poll-backstop idiom McpTaskPeekView (#1205) uses.
 * A no-op (`undefined` forever) when `client`/`sessionId`/`taskId` aren't
 * all available: a caller that hasn't threaded `client`/`sessionId` through
 * yet (or a `jarvis_run` handle whose task never reached the durable store)
 * still gets an honest static render from `call`/`result` alone — degraded,
 * never fabricated.
 */
function useLiveTaskRecord(
  client: Client | undefined,
  sessionId: string | undefined,
  taskId: string | undefined,
): SessionAsyncProcess | undefined {
  const [record, setRecord] = useState<SessionAsyncProcess | undefined>(undefined);

  useEffect(() => {
    setRecord(undefined);
    if (!client || !sessionId || !taskId) return;
    let cancelled = false;

    const reconcile = async () => {
      try {
        const { processes } = await fetchSessionAsyncProcesses(client, sessionId);
        if (cancelled) return;
        const fresh = processes.find((row) => row.kind === 'mcp-task' && taskIdOf(row) === taskId);
        if (fresh) setRecord(fresh);
      } catch {
        // Keeps whatever the last SSE event / prior reconcile already
        // produced — a transient fetch failure never clears a live view.
      }
    };
    void reconcile();

    const subscription =
      typeof EventSource !== 'undefined'
        ? subscribeSessionAsyncProcessEvents(client.sseUrl(sessionId), (event) => {
            const key = event.payload['key'] as { task_id?: unknown } | undefined;
            if (key?.task_id !== taskId) return;
            // The payload IS the full TaskRecord wire projection (no
            // kind/id/title of its own) — overlay it onto whatever is
            // already known, seeding a minimal row the first time.
            setRecord(
              (cur) =>
                ({
                  kind: 'mcp-task',
                  id: taskId,
                  title: '',
                  status: 'working',
                  ...cur,
                  ...event.payload,
                }) as SessionAsyncProcess,
            );
          })
        : null;
    const timer = window.setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      subscription?.close();
    };
  }, [client, sessionId, taskId]);

  return record;
}

/** `backend.console` folded by relay_console.py (`{tail, offset,
 *  truncated}`) — `undefined` when the record carries none yet (the common
 *  case before the first poll increment lands). */
function consoleOf(record: SessionAsyncProcess | undefined): { tail: string; truncated: boolean } | undefined {
  const backend = record?.['backend'];
  if (!isRecord(backend)) return undefined;
  const console_ = backend['console'];
  if (!isRecord(console_) || typeof console_['tail'] !== 'string') return undefined;
  return { tail: console_['tail'], truncated: console_['truncated'] === true };
}

function clusterOf(record: SessionAsyncProcess | undefined): string {
  const backend = record?.['backend'];
  return isRecord(backend) ? stringValue(backend['cluster']) : '';
}

const TERMINAL_PHASES: RunPhase[] = ['completed', 'failed', 'cancelled'];

/** The console tail's last {@link CONSOLE_VIEWPORT_LINES} lines — the record
 *  already bounds total bytes server-side; this only bounds the visible
 *  viewport height so one line-dense burst doesn't blow out the card. */
function consoleViewport(tail: string): string {
  const lines = tail.split('\n');
  return lines.length <= CONSOLE_VIEWPORT_LINES ? tail : lines.slice(-CONSOLE_VIEWPORT_LINES).join('\n');
}

export interface RunCardPartProps {
  call: WirePart;
  /** Absent while the call is still in flight — no result has arrived yet. */
  result?: WirePart;
  /** Live-refresh wiring (#1205's async-processes projection). Omitted at a
   *  call site that hasn't threaded it through yet — the card still renders
   *  honestly from `call`/`result` alone. */
  client?: Client;
  sessionId?: string;
}

export function RunCardPart({ call, result, client, sessionId }: RunCardPartProps) {
  const [open, setOpen] = useState(false);
  const name = str(call['tool_name'] ?? call['name']);
  const rawTitle = call['tool_title'];
  const fallbackTitle = RELAY_RUN_TITLES[name] ?? name;
  const title = typeof rawTitle === 'string' && rawTitle.trim() ? sanitizeTitle(rawTitle, fallbackTitle) : fallbackTitle;

  const input = isRecord(call['input']) ? (call['input'] as Record<string, unknown>) : {};
  const cluster = stringValue(input['cluster']);
  const pipelineId = stringValue(input['pipeline_id']);

  const resultPayload = result ? extractStructuredContent(result) : undefined;
  const taskId = isRecord(resultPayload)
    ? stringValue(resultPayload['task_id']) || stringValue(resultPayload['job_id'])
    : '';

  const liveRecord = useLiveTaskRecord(client, sessionId, taskId || undefined);
  const verdict = computeVerdict(result, liveRecord);
  const console_ = consoleOf(liveRecord);
  const displayCluster = clusterOf(liveRecord) || cluster;

  const createdAt = liveRecord?.created_at || '';
  const isTerminal = TERMINAL_PHASES.includes(verdict.phase);
  const endTime = isTerminal && liveRecord?.updated_at ? Date.parse(liveRecord.updated_at) : Date.now();
  const startTime = createdAt ? Date.parse(createdAt) : NaN;
  const durationMs = Number.isFinite(startTime) ? endTime - startTime : NaN;
  const durationLabel = Number.isFinite(durationMs) && durationMs > 0 ? formatDurationMs(durationMs) : '';

  const phaseText = verdict.detail ? `${PHASE_LABEL[verdict.phase]} · ${verdict.detail}` : PHASE_LABEL[verdict.phase];
  const previewLine = !open
    ? console_?.tail
      ? truncate((console_.tail.split('\n').filter((l) => l.trim()).pop() ?? '').trim(), 96)
      : ''
    : '';

  return (
    <div className="runcard" data-phase={verdict.phase} data-testid="run-card">
      <button
        type="button"
        className="runcard__head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <StatusDot status={verdict.dot} quiet={verdict.phase !== 'running'} />
        <span className="runcard__namewrap">
          <span className="runcard__name">{title}</span>
          {pipelineId ? <span className="runcard__hint">({pipelineId})</span> : null}
        </span>
        {displayCluster ? <span className="runcard__cluster" data-testid="run-card-cluster">{displayCluster}</span> : null}
        <span className="runcard__spacer" />
        <span
          className="runcard__phase"
          data-phase={verdict.phase}
          data-testid="run-card-phase"
          title={verdict.reason ?? undefined}
        >
          {phaseText}
        </span>
        {durationLabel ? (
          <span className="runcard__duration" data-testid="run-card-duration">
            {durationLabel}
          </span>
        ) : null}
        <span className="runcard__chev" data-open={open ? 'true' : undefined} aria-hidden="true">
          ▸
        </span>
      </button>
      {previewLine ? <p className="runcard__preview">{previewLine}</p> : null}
      {open ? (
        <div className="runcard__well" data-testid="run-card-well">
          <div className="runcard__section">
            <p className="runcard__sectionlabel">arguments</p>
            <div className="runcard__grid">
              {cluster ? (
                <div className="runcard__row">
                  <span className="runcard__k">cluster</span>
                  <span className="runcard__v">{cluster}</span>
                </div>
              ) : null}
              {pipelineId ? (
                <div className="runcard__row">
                  <span className="runcard__k">pipeline</span>
                  <span className="runcard__v">{pipelineId}</span>
                </div>
              ) : null}
            </div>
          </div>
          {console_ ? (
            <div className="runcard__section">
              <p className="runcard__sectionlabel">console</p>
              <pre className="runcard__console" data-testid="run-card-console">
                {consoleViewport(console_.tail)}
              </pre>
              {console_.truncated && !console_.tail.includes('earlier output elided') ? (
                <p className="runcard__consolenote" data-testid="run-card-console-truncated">
                  earlier output elided — the full console is kept on the record
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="runcard__section">
            <p className="runcard__sectionlabel">result</p>
            {verdict.reason ? (
              <p
                className="runcard__reason"
                data-error={verdict.phase === 'failed' ? 'true' : undefined}
                data-testid="run-card-reason"
              >
                {verdict.reason}
              </p>
            ) : null}
            {taskId ? (
              <div className="runcard__grid">
                <div className="runcard__row">
                  <span className="runcard__k">task id</span>
                  <span className="runcard__v">{taskId}</span>
                </div>
              </div>
            ) : !verdict.reason ? (
              <p className="runcard__waiting">waiting for the run to report back…</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
