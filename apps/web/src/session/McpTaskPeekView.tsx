/**
 * The async-processes tray's MCP-TASK PEEK (clio-agent#1205): a read-only
 * right-panel progress box for a durable relay/MCP task record. Chrome is
 * modeled on AgentPeekView (the existing read-only right-column pattern),
 * adapted for a record with no child session/transcript of its own — a
 * durable TaskRecord (`tools/mcp_task_records.py`) has no message history,
 * just a status/backend/timestamp projection, so this renders a field list
 * instead of mounting ChildFocusView.
 *
 * Live refresh rides the OWNING session's `mcp_task.*` SSE channel: the
 * event payload IS the full TaskRecord wire projection
 * (clio-agent's `mcp_task_events.py`), so a matching event is applied
 * directly with no follow-up fetch. A poll backstop re-fetches the
 * async-processes list in case the stream drops, mirroring AgentPeekView's
 * own reconcile interval — never a bare unexplained staleness.
 */
import { useEffect, useState } from 'react';
import {
  fetchSessionAsyncProcesses,
  subscribeSessionAsyncProcessEvents,
  type Client,
  type SessionAsyncProcess,
} from '@clio/core';
import { Icon, StatusDot, ToolbarButton, type SessionStatus } from '../kit';
import './mcptaskpeek.css';

/** SEP-2663 status -> the shared dot vocabulary, the same idea as
 *  AgentPeekView's dotStatus over the task-record status words. */
function dotStatus(status: string): SessionStatus {
  if (status === 'working') return 'running';
  if (status === 'failed' || status === 'error') return 'error';
  if (status === 'input_required') return 'queued';
  return 'idle';
}

/** Mirrors clio-agent's routes/async_processes.py `_MCP_TASK_LIVE_STATES` —
 *  a deliberately separate, tiny local copy rather than a shared import
 *  (the two projections are free to diverge, same reasoning the server side
 *  documents for not sharing run_registry.py's own copy). */
const MCP_TASK_LIVE_STATES: Record<string, string> = {
  working: 'running',
  input_required: 'input_required',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

const RECONCILE_INTERVAL_MS = 5000;

function taskId(process: SessionAsyncProcess): string {
  const key = process['key'] as { task_id?: unknown } | undefined;
  return typeof key?.task_id === 'string' ? key.task_id : process.id;
}

function backendLabel(process: SessionAsyncProcess): string | undefined {
  const backend = process['backend'] as Record<string, unknown> | undefined;
  const cluster = backend?.['cluster'];
  return typeof cluster === 'string' && cluster ? cluster : undefined;
}

export interface McpTaskPeekViewProps {
  client: Client;
  /** The OWNING session whose async-processes list this task belongs to —
   *  an mcp-task has no child session of its own. */
  sessionId: string;
  /** The tray's own row — the initial snapshot, rendered immediately. */
  process: SessionAsyncProcess;
  onClose: () => void;
}

export function McpTaskPeekView({ client, sessionId, process, onClose }: McpTaskPeekViewProps) {
  const [current, setCurrent] = useState(process);

  // A DIFFERENT task was clicked while this view was already open — never
  // keep showing the previous task's state under the new header.
  useEffect(() => {
    setCurrent(process);
  }, [process]);

  useEffect(() => {
    let cancelled = false;
    const id = taskId(current);

    const reconcile = async () => {
      try {
        const { processes } = await fetchSessionAsyncProcesses(client, sessionId);
        if (cancelled) return;
        const fresh = processes.find((row) => row.kind === 'mcp-task' && taskId(row) === id);
        if (fresh) setCurrent(fresh);
      } catch {
        // Keeps whatever the last SSE event / prior reconcile already produced.
      }
    };

    const subscription =
      typeof EventSource !== 'undefined'
        ? subscribeSessionAsyncProcessEvents(client.sseUrl(sessionId), (event) => {
            const key = event.payload['key'] as { task_id?: unknown } | undefined;
            if (key?.task_id !== id) return;
            // The payload IS the full TaskRecord wire projection — it carries
            // no `kind`/`id`/`title`/`live_state` keys, so spreading it over
            // `current` overlays status/backend/timestamps/etc. while leaving
            // those tray-derived fields untouched; live_state is recomputed
            // from the fresh status so it can never go stale.
            setCurrent((cur) => {
              const status =
                typeof event.payload['status'] === 'string'
                  ? (event.payload['status'] as string)
                  : cur.status;
              return {
                ...cur,
                ...event.payload,
                live_state: MCP_TASK_LIVE_STATES[status] ?? status,
              };
            });
          })
        : null;
    const timer = window.setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      subscription?.close();
    };
    // Deliberately keyed on `current.id`, NOT `current` — the task's id never
    // changes across an SSE-applied merge (the payload carries no `id`), so
    // re-running this effect on every field update would tear down and
    // reopen the EventSource on every single mcp_task.* event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, sessionId, current.id]);

  const status = current.status;
  const cluster = backendLabel(current);
  const holdingReason = current['holding_reason'];
  const cancelRequested = current['cancel_requested'] === true;

  return (
    <aside className="mcptaskpeek" aria-label="MCP task peek" data-testid="mcp-task-peek">
      <header className="mcptaskpeek__head">
        <div className="mcptaskpeek__eyebrowrow">
          <span className="mcptaskpeek__eyebrow" data-testid="mcp-task-peek-eyebrow">
            MCP TASK{status ? ` · ${status}` : ''}
          </span>
          {status ? <StatusDot status={dotStatus(status)} quiet={status !== 'working'} /> : null}
          <span className="mcptaskpeek__spacer" />
          <ToolbarButton
            label="Close peek"
            title="Close"
            iconOnly
            size="small"
            icon={<Icon name="x" size={11} />}
            onClick={onClose}
          />
        </div>
        <div className="mcptaskpeek__crumbrow">
          <span className="mcptaskpeek__crumblabel">session</span>
          <span className="mcptaskpeek__crumbsep" aria-hidden="true">
            ›
          </span>
          <span className="mcptaskpeek__name" data-testid="mcp-task-peek-name">
            {current.title}
          </span>
        </div>
      </header>
      <div className="mcptaskpeek__body">
        {holdingReason ? (
          <p className="mcptaskpeek__degrade" data-testid="mcp-task-peek-degrade">
            Held locally: {String(holdingReason)}
            {cancelRequested ? ' (cancel requested)' : ''}
          </p>
        ) : null}
        <dl className="mcptaskpeek__fields">
          <div className="mcptaskpeek__field">
            <dt>task id</dt>
            <dd>{taskId(current)}</dd>
          </div>
          {cluster ? (
            <div className="mcptaskpeek__field">
              <dt>host</dt>
              <dd>{cluster}</dd>
            </div>
          ) : null}
          {current.created_at ? (
            <div className="mcptaskpeek__field">
              <dt>created</dt>
              <dd>{current.created_at}</dd>
            </div>
          ) : null}
          {current.updated_at ? (
            <div className="mcptaskpeek__field">
              <dt>updated</dt>
              <dd>{current.updated_at}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </aside>
  );
}
