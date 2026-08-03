import { useCallback, useEffect, useState } from 'react';
import type { Client, Message, Session, Workspace } from '@clio/core';
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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [renamed, setRenamed] = useState<Record<string, string>>({});

  // Workspace paths name the rail groups. The prototype shows a TREE the user
  // recognises (/scratch/j4471, ~/rollups); an opaque ws_ id names nothing.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await client.workspaces();
        if (!cancelled) setWorkspaces(result.workspaces ?? []);
      } catch {
        // Labels degrade to ids, which the group still renders. Not worth
        // failing the whole view over.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

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

  // Renaming hits the real endpoint and updates the row optimistically, so the
  // title does not snap back to the old value while the request is in flight.
  const rename = useCallback(
    async (next: string) => {
      if (!activeId) return;
      setRenamed((prev) => ({ ...prev, [activeId]: next }));
      try {
        await client.patchSession(activeId, { title: next });
      } catch (err) {
        // Put the old title back rather than leaving a rename that never
        // reached the backend looking like it succeeded.
        setRenamed((prev) => {
          const { [activeId]: _dropped, ...rest } = prev;
          return rest;
        });
        setState({
          kind: 'failed',
          detail: `Rename failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
    [activeId, client],
  );

  return (
    <AppShell
      groups={groupByWorkspace(sessions, workspaces, renamed)}
      activeSessionId={activeId}
      onSelectSession={setActiveId}
      title={(activeId ? renamed[activeId] : undefined) ?? active?.title ?? ''}
      {...(active?.workspace_id ? { breadcrumb: active.workspace_id } : {})}
      ribbon={[{ id: 'main', label: 'main' }]}
      activeRibbonId="main"
      onSelectRibbon={() => {}}
      {...(active ? { onRenameSession: (next: string) => void rename(next) } : {})}
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
function groupByWorkspace(
  sessions: Session[],
  workspaces: Workspace[],
  renamed: Record<string, string> = {},
): RailGroup[] {
  const labels = new Map<string, string>();
  for (const ws of workspaces) {
    const root = (ws as { root_path?: string }).root_path;
    if (ws.id) labels.set(ws.id, root ? shortenPath(root) : ws.name || ws.id);
  }
  const groups = new Map<string, RailSession[]>();
  for (const session of sessions) {
    const key = session.workspace_id || 'ungrouped';
    const rows = groups.get(key) ?? [];
    rows.push({
      id: session.id,
      title: renamed[session.id] ?? session.title ?? session.id,
      status: toStatus(session.status),
      age: session.updated_at ? relativeAge(session.updated_at) : '',
    });
    groups.set(key, rows);
  }
  return [...groups.entries()].map(([id, rows]) => ({
    id,
    // Fall back to the id rather than an empty header: an unlabelled group
    // must still be identifiable.
    label: labels.get(id) ?? id,
    count: rows.length,
    sessions: rows,
  }));
}

/** Render a filesystem root the way the prototype does: home as `~`, forward
 *  slashes, so a Windows path reads like the design's `~/rollups`. */
export function shortenPath(root: string): string {
  const normalized = root.replace(/\\/g, '/');
  const home = /^([A-Za-z]:)?\/Users\/[^/]+/.exec(normalized);
  const shortened = home ? normalized.replace(home[0], '~') : normalized;
  return shortened.replace(/\/+$/, '');
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
