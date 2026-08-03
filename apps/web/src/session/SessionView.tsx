import { useCallback, useEffect, useState } from 'react';
import type { Client, Message, Session } from '@clio/core';
import { Composer } from '../composer/Composer';
import { AppShell } from '../shell/AppShell';
import type { RailGroup, RailSession } from '../shell/Rail';
import type { SessionStatus } from '../shell/StatusDot';
import { Transcript } from '../transcript/Transcript';
import './sessionview.css';

export interface SessionViewProps {
  client: Client;
  sessions: Session[];
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; messages: Message[] }
  | { kind: 'failed'; detail: string };

/**
 * The connected application.
 *
 * This is the surface a real user reaches after connecting, and it renders the
 * SAME shell/transcript/composer the fixtures harness does — the harness is a
 * development view of these components, not a separate implementation.
 */
export function SessionView({ client, sessions }: SessionViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  const load = useCallback(
    async (sessionId: string) => {
      setState({ kind: 'loading' });
      try {
        const result = await client.messages(sessionId);
        setState({ kind: 'loaded', messages: result.messages ?? [] });
      } catch (err) {
        // A failed load must never look like an empty session.
        setState({
          kind: 'failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [client],
  );

  useEffect(() => {
    if (activeId) void load(activeId);
  }, [activeId, load]);

  const active = sessions.find((s) => s.id === activeId);

  return (
    <AppShell
      groups={groupByWorkspace(sessions)}
      activeSessionId={activeId}
      onSelectSession={setActiveId}
      title={active?.title ?? ''}
      {...(active?.workspace_id ? { breadcrumb: active.workspace_id } : {})}
      ribbon={[{ id: 'main', label: 'main' }]}
      activeRibbonId="main"
      onSelectRibbon={() => {}}
    >
      {sessions.length === 0 ? (
        <p className="sessionview__notice" data-testid="sessions-empty">
          This backend has no sessions yet.
        </p>
      ) : null}

      {state.kind === 'idle' && sessions.length > 0 ? (
        <p className="sessionview__notice">Select a session to open it.</p>
      ) : null}

      {state.kind === 'loading' ? <p className="sessionview__notice">Loading…</p> : null}

      {state.kind === 'failed' ? (
        <p className="sessionview__error" data-testid="transcript-error" role="alert">
          Could not load this session: {state.detail}
        </p>
      ) : null}

      {state.kind === 'loaded' && state.messages.length === 0 ? (
        <p className="sessionview__notice" data-testid="transcript-empty">
          This session has no messages.
        </p>
      ) : null}

      {state.kind === 'loaded' && state.messages.length > 0 ? (
        <Transcript messages={state.messages} />
      ) : null}

      {active ? (
        <Composer
          models={[{ id: 'default', label: 'default' }]}
          modelId="default"
          onModelChange={() => {}}
          onSubmit={() => {}}
          busy
          busyReason="Sending is not wired to this backend yet (#334)."
        />
      ) : null}
    </AppShell>
  );
}

/** Group sessions by workspace, preserving backend order within each group. */
function groupByWorkspace(sessions: Session[]): RailGroup[] {
  const groups = new Map<string, RailSession[]>();
  for (const session of sessions) {
    const key = session.workspace_id || 'ungrouped';
    const rows = groups.get(key) ?? [];
    rows.push({
      id: session.id,
      title: session.title || session.id,
      status: toStatus(session.status),
      age: session.updated_at ? relativeAge(session.updated_at) : '',
    });
    groups.set(key, rows);
  }
  return [...groups.entries()].map(([id, rows]) => ({
    id,
    label: id,
    count: rows.length,
    sessions: rows,
  }));
}

/** Map wire status onto the rail's dot vocabulary without inventing states. */
function toStatus(status: unknown): SessionStatus {
  const value = String(status ?? '');
  if (value === 'running' || value === 'streaming') return 'running';
  if (value === 'error' || value === 'failed') return 'error';
  if (value === 'queued' || value === 'pending') return 'queued';
  return 'idle';
}

function relativeAge(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}
