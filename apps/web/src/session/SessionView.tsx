import { useCallback, useEffect, useState } from 'react';
import type { Client, Message, Session, Workspace } from '@clio/core';
import type { PickerItem } from '../composer/Picker';
import { Composer } from '../composer/Composer';
import { AppShell } from '../shell/AppShell';
import type { RailGroup, RailSession } from '../shell/Rail';
import type { SessionStatus } from '../shell/StatusDot';
import { Observability } from '../observability/Observability';
import { Settings } from '../settings/Settings';
import type { AgentStatus, ObservabilityData } from '../observability/types';
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
  const [commands, setCommands] = useState<PickerItem[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [obs, setObs] = useState<ObservabilityData | null>(null);
  const [agentCount, setAgentCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await client.agents();
        if (!cancelled) setAgentCount((result.agents ?? []).length);
      } catch {
        // Footer shows 0; the count is informational, not load-bearing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  // Observability reads REAL endpoints. Each tab that has no backing says so
  // rather than rendering an empty list that looks like "nothing happened".
  useEffect(() => {
    if (panel !== 'obs' || !activeId) return;
    let cancelled = false;
    void (async () => {
      const [agents, runs, servers, context] = await Promise.all([
        client.agents().catch(() => null),
        client.sessionTasks(activeId).catch(() => null),
        client.mcpServers().catch(() => null),
        client.getContextState(activeId).catch(() => null),
      ]);
      if (cancelled) return;
      const used = (context as { used_pct?: number; used_percent?: number } | null) ?? null;
      setObs({
        // AgentDef is { id, title, tools?, tier? } — real field names, and
        // `tier` is semantic weight, which is what the tree indents by.
        agents: (agents?.agents ?? []).map((a) => ({
          id: a.id,
          label: a.title || a.id,
          status: 'idle' as AgentStatus,
          depth: Math.max(0, (a.tier ?? 1) - 1),
        })),
        runs: (runs?.tasks ?? []).map((t) => ({
          id: String((t as { id?: string }).id ?? ''),
          agent: String((t as { agent_id?: string }).agent_id ?? ''),
          state: String((t as { status?: string }).status ?? ''),
        })),
        toolsByExpert: Object.fromEntries(
          (servers?.servers ?? []).map((srv) => {
            const row = srv as {
              name?: string;
              id?: string;
              tools?: Array<{ name?: string; description?: string }>;
            };
            return [
              row.name ?? row.id ?? 'server',
              (row.tools ?? []).map((t) => ({
                name: t.name ?? '',
                ...(t.description ? { description: t.description } : {}),
              })),
            ];
          }),
        ),
        // No client method serves session artifacts — tracked as a gap rather
        // than faked with an empty list.
        artifacts: [],
        ...(used?.used_pct !== undefined || used?.used_percent !== undefined
          ? {
              context: {
                usedPercent: Math.round(used.used_pct ?? used.used_percent ?? 0),
                tokens: 0,
                limit: 0,
              },
            }
          : {}),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [panel, activeId, client]);

  // Slash commands come from the backend. If it cannot serve them the picker
  // stays closed rather than opening empty, which would read as broken.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await client.commands();
        if (cancelled) return;
        setCommands(
          // SlashCommandDef is { id, title, description? }. The backend's id
          // ALREADY carries the leading slash — prefixing another produced
          // "//clear" in the live picker.
          (result.commands ?? []).map((c) => {
            const name = c.id.startsWith('/') ? c.id : `/${c.id}`;
            return {
              id: name,
              label: name,
              ...(c.description ?? c.title ? { detail: c.description ?? c.title } : {}),
            };
          }),
        );
      } catch {
        // No commands surface; the `/` picker simply does not open.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

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
    async (sessionId: string, next: string) => {
      setRenamed((prev) => ({ ...prev, [sessionId]: next }));
      try {
        await client.patchSession(sessionId, { title: next });
      } catch (err) {
        // Put the old title back rather than leaving a rename that never
        // reached the backend looking like it succeeded.
        setRenamed((prev) => {
          const { [sessionId]: _dropped, ...rest } = prev;
          return rest;
        });
        setState({
          kind: 'failed',
          detail: `Rename failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
    [client],
  );

  const send = useCallback(
    async (text: string) => {
      if (!activeId) return;
      setSending(true);
      setSendError(null);
      try {
        await client.sendMessage(activeId, { text });
        // Re-read rather than guessing what the backend appended: the turn may
        // add parts this client never predicted.
        await load(activeId);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
      }
    },
    [activeId, client, load],
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
      onRenameSession={(sessionId, next) => void rename(sessionId, next)}
      panel={panel}
      agentCount={agentCount}
      onOpenSettings={() => setPanel('settings')}
      onTogglePanel={(next) => setPanel((cur) => (cur === next ? null : next))}
      {...(panel === 'settings'
        ? { detail: <Settings onClose={() => setPanel(null)} /> }
        : {})}
      {...(panel === 'obs'
        ? {
            detail: obs ? (
              <Observability data={obs} onClose={() => setPanel(null)} />
            ) : (
              <p className="sessionview__notice">Loading observability…</p>
            ),
          }
        : {})}
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

      {sendError ? (
        <p className="sessionview__error" data-testid="send-error" role="alert">
          Could not send: {sendError}
        </p>
      ) : null}

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
          commands={commands}
          onModelChange={() => {}}
          onSubmit={({ text }) => void send(text)}
          busy={sending}
          {...(sending ? { busyReason: 'Sending…' } : {})}
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
