import { useCallback, useEffect, useState } from 'react';
import {
  fetchSessionAgentTasks,
  fetchSessionArtifacts,
  fetchSessionContextState,
  subscribeSessionTraceEvents,
  type Client,
  type Message,
  type Session,
  type Workspace,
} from '@clio/core';
import type { PickerItem } from '../composer/Picker';
import { Composer, type ApprovalMode, type ComposerMode } from '../composer/Composer';
import type { ProviderModelGroup } from '../composer/ProviderModelPicker';
import { VersionUpdate } from '../composer/VersionUpdate';
import { AppShell } from '../shell/AppShell';
import {
  RailActionsProvider,
  type RailConnection,
  type RailGroup,
  type RailSession,
  type SessionAction,
  type WorkspaceAction,
} from '../shell/Rail';
import { Icon, Layer, type SelectOption, type SessionStatus } from '../kit';
import { loadRegistry } from '../connect/registry';
import { Observability, ObservabilityTrace } from '../observability/Observability';
import type { ObsTab } from '../observability/Observability';
import { buildObservabilityTrace, timelineRowFromSessionTraceEvent } from '../observability/build';
import { Settings } from '../settings/Settings';
import type { AgentStatus, ObservabilityData } from '../observability/types';
import { Transcript } from '../transcript/Transcript';
import { BlueprintWindow } from './BlueprintWindow';
import { ConsoleDock } from './ConsoleDock';
import { FilesLayer } from './FilesLayer';
import { FreshHeadline, FreshStarting, SuggestedPrompts, type FreshStarter } from './FreshState';
import { NewDialog, SearchDialog } from './SessionDialogs';
import './sessionview.css';

export interface SessionViewProps {
  client: Client;
  sessions: Session[];
  /** Drop a row whose session the backend no longer has. */
  onForgetSession?: (sessionId: string) => void;
  /** A session brought into being by the first send, so the rail can show it. */
  onSessionCreated?: (session: Session) => void;
  /** capabilities.backend.version, for the prototype's version stamp. */
  backendVersion?: string;
  /**
   * A newer APP build is deployed (client-side check, see wire/updateCheck).
   * Deliberately distinct from `backendVersion`: they are different subjects.
   */
  newBuildAvailable?: boolean;
  /** Connected clio deployments, owned by the pool in App (S6). */
  connections?: RailConnection[];
  activeConnectionId?: string;
  onSwitchConnection?: (id: string) => void;
}

/** The fields of the session record the composer renders. */
interface SessionDetail {
  model?: { provider_id?: string; model_id?: string; variant?: string };
  approval_mode?: ApprovalMode;
  mode?: 'plan' | 'edit' | 'architect';
  metadata?: { active_agent_blueprint_id?: string };
}

interface ComposerPillState {
  sessionId: string;
  scope: string;
  asyncCount?: number;
  contextPercent?: number;
  artifactCount?: number;
}

const TERMINAL_AGENT_TASK_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'detached',
  'done',
  'error',
]);

const PINS_STORAGE_KEY = 'clio.pins.v1';
const WORKSPACE_PINS_STORAGE_KEY = 'clio.workspace-pins.v1';
const NO_MESSAGES: Message[] = [];

/**
 * The prototype's SUGGESTED rows (design/prototype/Clio Session.html,
 * emptyStarters) are static content in its OWN source — there is no
 * backend generator for them, so this is the honest, matching baseline. Row
 * 1's subtitle is the one piece that is genuinely dynamic there
 * (`'in ' + workspace`); the rest is verbatim prototype copy.
 */
function freshStarters(workspaceLabel: string | undefined): FreshStarter[] {
  return [
    { text: 'Profile a dataset', meta: workspaceLabel ? `in ${workspaceLabel}` : 'in this workspace' },
    { text: 'Run a benchmark sweep', meta: 'on ares, compared against last week' },
    { text: 'Find what is filling scratch', meta: 'and propose what to archive' },
  ];
}

function optionalFetch<T>(request: () => Promise<T>): Promise<T | null> {
  return Promise.resolve()
    .then(request)
    .catch(() => null);
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; messages: Message[] }
  // A 404 is its own state: the row points at something the backend no longer
  // has, which is actionable (remove it) rather than merely broken.
  | { kind: 'missing' }
  | { kind: 'failed'; detail: string };

/**
 * The connected application.
 *
 * This is the surface a real user reaches after connecting, and it renders the
 * SAME shell/transcript/composer the fixtures harness does — the harness is a
 * development view of these components, not a separate implementation.
 */
export function SessionView({
  client,
  sessions,
  onForgetSession,
  onSessionCreated,
  backendVersion,
  newBuildAvailable,
  connections,
  activeConnectionId,
  onSwitchConnection,
}: SessionViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const [renamedWorkspaces, setRenamedWorkspaces] = useState<Record<string, string>>({});
  const [commands, setCommands] = useState<PickerItem[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newWorkspaceId, setNewWorkspaceId] = useState<string | undefined>(undefined);
  // A SUGGESTED row click fills the composer; token forces the effect to
  // refire even when the same starter is picked twice in a row.
  const [starterPrompt, setStarterPrompt] = useState<{ text: string; token: number } | null>(
    null,
  );
  // Pill-chip deep links land the obs layer on a specific tab (async -> runs,
  // ctx -> context); the eye button leaves it undefined = default tab.
  const [obsTab, setObsTab] = useState<ObsTab | undefined>(undefined);
  const [obs, setObs] = useState<ObservabilityData | null>(null);
  const [liveTraceRows, setLiveTraceRows] = useState<NonNullable<ObservabilityData['timeline']>>(
    [],
  );
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [modelOptions, setModelOptions] = useState<SelectOption[]>([]);
  const [modelProviders, setModelProviders] = useState<ProviderModelGroup[]>([]);
  const [thinkingLevel, setThinkingLevel] = useState<string | undefined>(undefined);
  const [activeScope, setActiveScope] = useState('main');
  const [pillState, setPillState] = useState<ComposerPillState | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => loadPins(client.baseUrl));
  const [pinnedWorkspaceIds, setPinnedWorkspaceIds] = useState<Set<string>>(() =>
    loadWorkspacePins(client.baseUrl),
  );
  const [removedWorkspaceIds, setRemovedWorkspaceIds] = useState<Set<string>>(new Set());
  const [createdWorkspaces, setCreatedWorkspaces] = useState<Record<string, string>>({});

  useEffect(() => {
    setPinnedIds(loadPins(client.baseUrl));
    setPinnedWorkspaceIds(loadWorkspacePins(client.baseUrl));
    setRemovedWorkspaceIds(new Set());
    setRenamedWorkspaces({});
  }, [client.baseUrl]);

  // The rail footer counts CONNECTED CLIO DEPLOYMENTS the user can swap
  // between (a local one, one on ares, ...). It is a UI-owned concept like
  // pin, not a backend one — it must never be the expert-registry size, which
  // is what /v1/agents returns and what this used to show.
  const connectedCount = loadRegistry().backends.length;

  // Provider navigation, per-provider model rows, and readiness all come from
  // the read-only LM configuration and live catalogues.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [{ providers = [] }, lm] = await Promise.all([
          client.providers(),
          optionalFetch(() => client.lmConfig()),
        ]);
        const presets = lm?.presets ?? [];
        const perProvider = await Promise.all(
          providers.map(async (p) => {
            try {
              const { models = [] } = await client.providerModels(p.id);
              const preset = presets.find((candidate) => candidate.provider === p.id || candidate.id === p.id);
              return {
                id: p.id,
                label: p.name || p.id,
                status: preset?.status || (p.is_authenticated ? 'configured' : 'not configured'),
                statusLabel: preset?.status_message || preset?.status || (p.is_authenticated ? 'configured' : 'not configured'),
                models: models.map((model) => ({
                  id: model.id,
                  value: `${p.id}/${model.id}`,
                  label: model.name || model.id,
                  detail: model.id,
                })),
              } satisfies ProviderModelGroup;
            } catch {
              const preset = presets.find((candidate) => candidate.provider === p.id || candidate.id === p.id);
              return {
                id: p.id,
                label: p.name || p.id,
                status: preset?.status || 'catalog unavailable',
                statusLabel: preset?.status_message || preset?.status || 'catalog unavailable',
                models: [],
              } satisfies ProviderModelGroup;
            }
          }),
        );
        if (!cancelled) {
          setModelProviders(perProvider);
          setModelOptions(perProvider.flatMap((provider) => provider.models.map((model) => ({ id: model.value, label: model.label, detail: provider.label }))));
          setThinkingLevel(lm?.thinking_level || undefined);
        }
      } catch {
        // Leaves the control empty, which reads as "nothing to choose".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const loadObservability = useCallback(
    async (sessionId: string, scope: string, messages: Message[]): Promise<ObservabilityData> => {
      const [agents, sessionRuns, servers, context, agentTasksResult, artifactResult] =
        await Promise.all([
          optionalFetch(() => client.agents()),
          optionalFetch(() => client.sessionTasks(sessionId)),
          optionalFetch(() => client.mcpServers()),
          optionalFetch(() => fetchSessionContextState(client, sessionId, scope)),
          optionalFetch(() => fetchSessionAgentTasks(client, sessionId)),
          optionalFetch(() => fetchSessionArtifacts(client, sessionId, { includeChildren: true })),
        ]);
      const agentTasks = agentTasksResult?.tasks ?? [];
      const artifactRecords = artifactResult?.artifacts ?? [];
      const trace = buildObservabilityTrace({
        messages,
        agentTasks,
        artifacts: artifactRecords,
      });
      const durationById = new Map(trace.spans.map((span) => [span.id, span.duration]));
      const taskRuns = agentTasks.flatMap((task) => {
        const id = task.task_id || task.id;
        if (!id) return [];
        const label = task.run_label || task.agent_ref?.expert_id;
        const host = task.host || task.placement;
        const duration = durationById.get(id);
        return [
          {
            id,
            agent: task.agent_ref?.expert_id ?? '',
            state: task.status || task.live_state || 'unknown',
            ...(label ? { label } : {}),
            ...(host ? { host } : {}),
            ...(duration ? { duration } : {}),
          },
        ];
      });
      const taskRunIds = new Set(taskRuns.map((run) => run.id));
      const existingRuns = (sessionRuns?.tasks ?? [])
        .filter((task) => !taskRunIds.has(task.id))
        .map((task) => {
          const agent = task.metadata?.['agent_id'];
          const host = task.metadata?.['host'];
          return {
            id: task.id,
            label: task.title,
            agent: typeof agent === 'string' ? agent : '',
            state: task.status,
            ...(typeof host === 'string' && host ? { host } : {}),
          };
        });
      const usedFraction = context?.used_pct ?? context?.pct_used;
      const usedPercent =
        typeof usedFraction === 'number' && Number.isFinite(usedFraction)
          ? Math.round(usedFraction <= 1 ? usedFraction * 100 : usedFraction)
          : null;
      // Real per-message cost, summed — never estimated from token counts.
      // costSeen distinguishes "no message reported a cost" (undefined, shown
      // as "not reported") from a genuine $0.00.
      let costSum = 0;
      let costSeen = false;
      for (const message of messages) {
        if (typeof message.cost_usd === 'number' && Number.isFinite(message.cost_usd)) {
          costSum += message.cost_usd;
          costSeen = true;
        }
      }

      return {
        // Agent definitions remain available for legacy consumers; the P5 UI
        // projects active work through runs and timeline instead of an agents tab.
        agents: (agents?.agents ?? []).map((agent) => ({
          id: agent.id,
          label: agent.title || agent.id,
          status: 'idle' as AgentStatus,
          depth: Math.max(0, (agent.tier ?? 1) - 1),
        })),
        runs: [...taskRuns, ...existingRuns],
        toolsByExpert: Object.fromEntries(
          (servers?.servers ?? []).map((server) => {
            const row = server as {
              name?: string;
              id?: string;
              tools?: Array<{ name?: string; description?: string }>;
            };
            return [
              row.name ?? row.id ?? 'server',
              (row.tools ?? []).map((tool) => ({
                name: tool.name ?? '',
                ...(tool.description ? { description: tool.description } : {}),
              })),
            ];
          }),
        ),
        artifacts: artifactRecords.map((record) => ({
          id: record.head_artifact_id || `${record.workspace_id ?? 'workspace'}:${record.name}`,
          label: record.name,
          ...(record.kind ? { kind: record.kind } : {}),
        })),
        ...trace,
        ...(usedPercent !== null
          ? {
              context: {
                usedPercent,
                tokens: context?.used_tokens ?? context?.live_tokens ?? 0,
                limit: context?.window_tokens ?? 0,
                ...(costSeen ? { costUsd: costSum } : {}),
              },
            }
          : {}),
      };
    },
    [client],
  );

  const observabilityMessages = state.kind === 'loaded' ? state.messages : NO_MESSAGES;

  useEffect(() => {
    if (panel !== 'obs') return;
    setObs(null);
    setLiveTraceRows([]);
  }, [panel, activeId, client]);

  useEffect(() => {
    if (panel !== 'obs' || !activeId) return;
    let cancelled = false;
    const refresh = async () => {
      const next = await loadObservability(activeId, activeScope, observabilityMessages);
      if (!cancelled) setObs(next);
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [panel, activeId, activeScope, loadObservability, observabilityMessages]);

  useEffect(() => {
    if (panel !== 'obs' || !activeId || typeof EventSource === 'undefined') return;
    let cancelled = false;
    const subscription = subscribeSessionTraceEvents(client.sseUrl(activeId), (event) => {
      const row = timelineRowFromSessionTraceEvent(event);
      setLiveTraceRows((previous) => {
        if (row.sourceId && previous.some((item) => item.sourceId === row.sourceId))
          return previous;
        const next = [...previous, row];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });

      if (event.type === 'session.status_changed') {
        void loadObservability(activeId, activeScope, observabilityMessages).then((next) => {
          if (!cancelled) setObs(next);
        });
      }
    });
    return () => {
      cancelled = true;
      subscription.close();
    };
  }, [panel, activeId, activeScope, client, loadObservability, observabilityMessages]);

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
              ...((c.description ?? c.title) ? { detail: c.description ?? c.title } : {}),
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

  const refreshPill = useCallback(
    async (sessionId: string, scope: string) => {
      const [tasksResult, contextResult, artifactsResult] = await Promise.allSettled([
        Promise.resolve().then(() => fetchSessionAgentTasks(client, sessionId)),
        Promise.resolve().then(() => fetchSessionContextState(client, sessionId, scope)),
        Promise.resolve().then(() =>
          fetchSessionArtifacts(client, sessionId, { includeChildren: true }),
        ),
      ]);
      const next: ComposerPillState = { sessionId, scope };

      if (tasksResult.status === 'fulfilled') {
        next.asyncCount = tasksResult.value.tasks.filter(
          (task) => !TERMINAL_AGENT_TASK_STATUSES.has(String(task.status).toLowerCase()),
        ).length;
      }

      if (contextResult.status === 'fulfilled') {
        const usedPercent = contextResult.value.used_pct ?? contextResult.value.pct_used;
        if (typeof usedPercent === 'number' && Number.isFinite(usedPercent)) {
          next.contextPercent = Math.round(usedPercent);
        }
      }

      if (artifactsResult.status === 'fulfilled') {
        const artifactRows = Array.isArray(artifactsResult.value.artifacts)
          ? artifactsResult.value.artifacts
          : [];
        next.artifactCount =
          typeof artifactsResult.value.count === 'number'
            ? artifactsResult.value.count
            : artifactRows.length;
      }

      setPillState(next);
    },
    [client],
  );

  const load = useCallback(
    async (sessionId: string) => {
      setState({ kind: 'loading' });
      setDetail(null);
      // The record carries model + approval_mode, which the composer renders.
      // A failure here must not fail the transcript, so it is read separately.
      void Promise.resolve()
        .then(() => client.getSession(sessionId))
        .then((row) => setDetail(row as unknown as SessionDetail))
        // A backend that cannot serve the record leaves the composer without
        // model/approval controls rather than failing the transcript with it.
        .catch(() => setDetail(null));
      try {
        const result = await client.messages(sessionId);
        setState({ kind: 'loaded', messages: result.messages ?? [] });
      } catch (err) {
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status?: unknown }).status
            : undefined;
        if (status === 404) {
          setState({ kind: 'missing' });
          return;
        }
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
    if (!activeId) {
      setPillState(null);
      return;
    }
    void load(activeId);
    void refreshPill(activeId, activeScope);
  }, [activeId, activeScope, load, refreshPill]);

  const active = sessions.find((s) => s.id === activeId);
  const activeBlueprintId = detail?.metadata?.active_agent_blueprint_id;
  const activeConnectionLabel =
    connections?.find((connection) => connection.id === activeConnectionId)?.label ??
    connectionDisplayLabel(client.baseUrl);
  const activeWorkspaceId =
    active?.workspace_id ?? (activeId ? createdWorkspaces[activeId] : undefined);
  const activeWorkspaceLabel = activeWorkspaceId
    ? workspaceDisplayLabel(activeWorkspaceId, workspaces)
    : undefined;
  // Pre-session the prototype's pill and headline still name a workspace —
  // the current/default one, not nothing. workspaces[0] is the best
  // available "current" answer until the app models connections' own
  // default roots.
  const defaultWorkspaceLabel = workspaces[0]
    ? workspaceDisplayLabel(workspaces[0].id, workspaces)
    : undefined;
  const resolvedWorkspaceLabel = activeWorkspaceLabel ?? defaultWorkspaceLabel;
  const placement = `${activeConnectionLabel}:${resolvedWorkspaceLabel ?? 'ungrouped'}`;
  const activePill =
    pillState?.sessionId === activeId && pillState.scope === activeScope ? pillState : null;
  const waitingCount = activePill?.asyncCount ?? 0;
  const transcriptMessages: Message[] =
    state.kind === 'loaded' && waitingCount > 0
      ? [
          ...state.messages,
          {
            id: `${activeId ?? 'session'}:transcript-activity`,
            role: 'assistant',
            // This marker is UI-owned and never written back to the backend's
            // closed wire Part union.
            parts: [
              { type: 'transcript_activity', count: waitingCount },
            ] as unknown as Message['parts'],
          },
        ]
      : state.kind === 'loaded'
        ? state.messages
        : [];

  const createAndSelectSession = useCallback(
    async (workspaceId?: string, title = 'untitled session'): Promise<Session> => {
      const targetWorkspace = workspaceId ?? active?.workspace_id;
      const created = await client.createSession({
        title,
        ...(targetWorkspace ? { workspace_id: targetWorkspace } : {}),
      });
      const createdWorkspace = created.workspace_id || targetWorkspace;
      if (createdWorkspace) {
        setCreatedWorkspaces((current) => ({ ...current, [created.id]: createdWorkspace }));
      }
      setActiveId(created.id);
      onSessionCreated?.(created);
      return created;
    },
    [active?.workspace_id, client, onSessionCreated],
  );

  const openNewDialog = useCallback((workspaceId?: string): void => {
    setNewWorkspaceId(workspaceId);
    setNewOpen(true);
  }, []);

  // The files layer's "attach to message" affordance — the prototype's own
  // button has no click handler at all (a static mockup element), but the
  // composer already exposes a real draft-insertion path (the SUGGESTED-row
  // mechanism), so wire it to something that actually works rather than
  // leaving it decorative.
  const attachFileToComposer = useCallback((path: string): void => {
    setStarterPrompt((current) => ({ text: `@${path}`, token: (current?.token ?? 0) + 1 }));
    setPanel(null);
  }, []);

  const createFromDialog = useCallback(
    async (input: {
      title: string;
      workspaceId?: string;
      blueprintId?: string;
      expertPackId?: string;
    }): Promise<void> => {
      const created = await createAndSelectSession(input.workspaceId, input.title);
      if (input.blueprintId) {
        await client.setSessionBlueprint(created.id, { blueprint_id: input.blueprintId });
      }
      if (input.expertPackId) {
        await client.setSessionExpertPack(created.id, { pack_id: input.expertPackId });
      }
    },
    [client, createAndSelectSession],
  );

  const createWorkspaceFromDialog = useCallback(
    async ({ name, rootPath }: { name: string; rootPath: string }): Promise<void> => {
      const created = await client.createWorkspace({
        root_path: rootPath,
        ...(name ? { name } : {}),
      });
      setWorkspaces((current) => [...current.filter((item) => item.id !== created.id), created]);
    },
    [client],
  );

  const handleSessionAction = useCallback(
    (sessionId: string, action: SessionAction): void => {
      setActionError(null);
      if (action === 'pin') {
        setPinnedIds((current) => {
          const next = new Set(current);
          if (next.has(sessionId)) next.delete(sessionId);
          else next.add(sessionId);
          savePins(client.baseUrl, next);
          return next;
        });
        return;
      }
      if (action !== 'delete') return;
      void (async () => {
        try {
          await client.deleteSession(sessionId);
          onForgetSession?.(sessionId);
          if (activeId === sessionId) {
            setActiveId(null);
            setState({ kind: 'idle' });
          }
        } catch (error) {
          setActionError(
            `Delete session failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      })();
    },
    [activeId, client, onForgetSession],
  );

  const handleWorkspaceAction = useCallback(
    (workspaceId: string, action: WorkspaceAction): void => {
      setActionError(null);
      if (action === 'pin') {
        setPinnedWorkspaceIds((current) => {
          const next = new Set(current);
          if (next.has(workspaceId)) next.delete(workspaceId);
          else next.add(workspaceId);
          saveWorkspacePins(client.baseUrl, next);
          return next;
        });
        return;
      }
      if (action !== 'remove') return;
      void (async () => {
        try {
          await client.deleteWorkspace(workspaceId);
          setRemovedWorkspaceIds((current) => new Set(current).add(workspaceId));
          setWorkspaces((current) => current.filter((workspace) => workspace.id !== workspaceId));
          if (active?.workspace_id === workspaceId) {
            setActiveId(null);
            setState({ kind: 'idle' });
          }
        } catch (error) {
          setActionError(
            `Remove workspace failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      })();
    },
    [active?.workspace_id, client],
  );

  const renameWorkspace = useCallback(
    async (workspaceId: string, next: string): Promise<void> => {
      setActionError(null);
      const previous = renamedWorkspaces[workspaceId];
      setRenamedWorkspaces((current) => ({ ...current, [workspaceId]: next }));
      try {
        const updated = await client.patchWorkspace(workspaceId, { name: next });
        setWorkspaces((current) =>
          current.map((workspace) => (workspace.id === workspaceId ? updated : workspace)),
        );
      } catch (error) {
        setRenamedWorkspaces((current) => {
          if (previous !== undefined) return { ...current, [workspaceId]: previous };
          const { [workspaceId]: _dropped, ...rest } = current;
          return rest;
        });
        setActionError(
          `Rename workspace failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [client, renamedWorkspaces],
  );

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

  // The composer's model id is "<provider>/<model>", matching the option ids.
  const modelId =
    detail?.model?.provider_id && detail.model.model_id
      ? `${detail.model.provider_id}/${detail.model.model_id}`
      : '';

  const setApprovalMode = useCallback(
    async (next: ApprovalMode) => {
      if (!activeId) return;
      const previous = detail?.approval_mode;
      setDetail((cur) => ({ ...cur, approval_mode: next }));
      try {
        await client.patchSession(activeId, { approval_mode: next });
      } catch {
        // Revert rather than leave the control asserting a mode the backend
        // never accepted.
        setDetail((cur) => ({ ...cur, ...(previous ? { approval_mode: previous } : {}) }));
      }
    },
    [activeId, client, detail?.approval_mode],
  );

  const setModel = useCallback(
    async (next: string) => {
      if (!activeId) return;
      const [providerId, ...rest] = next.split('/');
      const modelRef = { provider_id: providerId ?? '', model_id: rest.join('/'), variant: '' };
      const previous = detail?.model;
      setDetail((cur) => ({ ...cur, model: modelRef }));
      try {
        await client.patchSession(activeId, { model: modelRef });
      } catch {
        setDetail((cur) => ({ ...cur, ...(previous ? { model: previous } : {}) }));
      }
    },
    [activeId, client, detail?.model],
  );

  const send = useCallback(
    async (text: string, mode: ComposerMode) => {
      setSending(true);
      setSendError(null);
      try {
        // No session selected means a FRESH one, not a dead end: the default
        // view is an empty session you can type into, so the first send is
        // what brings the session into being.
        let target = activeId;
        if (!target) {
          const created = await createAndSelectSession();
          target = created.id;
        }
        const wireMode = mode === 'plan' ? 'plan' : 'edit';
        if (typeof client.patchSession === 'function') {
          await client.patchSession(target, { mode: wireMode });
          setDetail((current) => ({ ...current, mode: wireMode }));
        }
        await client.sendMessage(target, { text });
        // Re-read rather than guessing what the backend appended: the turn may
        // add parts this client never predicted.
        await load(target);
        await refreshPill(target, activeScope);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
      }
    },
    [activeId, activeScope, client, createAndSelectSession, load, refreshPill],
  );

  const observabilityData = obs
    ? { ...obs, timeline: [...(obs.timeline ?? []), ...liveTraceRows] }
    : null;
  const filesWorkspaceId = activeWorkspaceId ?? newWorkspaceId ?? workspaces[0]?.id;
  const filesWorkspaceLabel = filesWorkspaceId
    ? workspaceDisplayLabel(filesWorkspaceId, workspaces)
    : undefined;

  // The prototype's "New session" screen: no active session yet, OR a real
  // session that has not carried its first turn (isEmpty/emptyMsgs.length
  // === 0 in the prototype's own state). `sending` stands in for its
  // optimistic `emptyMsgs` echo — the moment a turn goes out, the headline
  // and SUGGESTED rows give way to the "starting the session on…" line and
  // the spacer below starts collapsing, before the real message even lands.
  const isIdleLayout = state.kind === 'idle' || (state.kind === 'loaded' && state.messages.length === 0);
  const idleStarted = sending;
  // contextPercent defaults to 0 pre-session (needs no read, per the
  // prototype's own default pill); once a real session exists the REAL
  // fetched value is authoritative, including while it is still loading.
  const composerContextPercent = activeId ? activePill?.contextPercent : 0;
  // The prototype also reads "· update available"; no endpoint reports
  // update state, so that half is omitted, not invented.
  const versionLine = backendVersion ? (
    <div className="sessionview__version">
      <VersionUpdate
        backendVersion={backendVersion}
        {...(newBuildAvailable ? { newBuildAvailable: true } : {})}
      />
    </div>
  ) : null;
  // The prototype nests SUGGESTED and the version line INSIDE the composer's
  // own dock (frame -> SUGGESTED -> version), not beside it — the composer's
  // existing 36px gutter already covers both, so they ride its `footer` slot
  // rather than a second wrapper that would double the inset.
  const composerFooter =
    isIdleLayout && !idleStarted ? (
      <>
        <SuggestedPrompts
          starters={freshStarters(resolvedWorkspaceLabel)}
          onUse={(text) =>
            setStarterPrompt((current) => ({ text, token: (current?.token ?? 0) + 1 }))
          }
        />
        {versionLine}
      </>
    ) : (
      versionLine
    );
  const composerElement =
    state.kind !== 'missing' ? (
      <Composer
        // A session can carry no model, and clio-agent exposes no endpoint
        // for the model that would ACTUALLY answer the turn (/v1/models and
        // /v1/system both 404). Say so rather than render a bare chevron.
        models={modelId ? modelOptions : [{ id: '', label: 'model not set' }, ...modelOptions]}
        modelId={modelId}
        modelProviders={modelProviders}
        {...(thinkingLevel ? { thinkingLevel } : {})}
        sessionMode={detail?.mode === 'plan' ? 'plan' : 'execute'}
        commands={commands}
        placement={placement}
        {...(activePill?.asyncCount !== undefined ? { asyncCount: activePill.asyncCount } : {})}
        {...(composerContextPercent !== undefined ? { contextPercent: composerContextPercent } : {})}
        {...(detail?.approval_mode ? { approvalMode: detail.approval_mode } : {})}
        onApprovalModeChange={(next) => void setApprovalMode(next)}
        onModelChange={(next) => void setModel(next)}
        onOpenAsync={() => {
          setObsTab('runs');
          setPanel('obs');
        }}
        onOpenContext={() => {
          setObsTab('context');
          setPanel('obs');
        }}
        onSubmit={({ text, mode }) => void send(text, mode)}
        busy={sending}
        {...(sending ? { busyReason: 'Sending…' } : {})}
        {...(starterPrompt ? { insertPrompt: starterPrompt } : {})}
        {...(composerFooter ? { footer: composerFooter } : {})}
      />
    ) : null;

  return (
    <RailActionsProvider
      onNewSession={openNewDialog}
      onSessionAction={handleSessionAction}
      onWorkspaceAction={handleWorkspaceAction}
      onRenameWorkspace={(workspaceId, next) => void renameWorkspace(workspaceId, next)}
      onOpenWorkspaceFiles={(workspaceId) => {
        setNewWorkspaceId(workspaceId);
        setPanel('files');
      }}
    >
      <AppShell
        groups={groupByWorkspace(
          sessions,
          workspaces,
          renamed,
          pinnedIds,
          renamedWorkspaces,
          pinnedWorkspaceIds,
          removedWorkspaceIds,
        )}
        activeSessionId={activeId}
        onSelectSession={setActiveId}
        title={(activeId ? renamed[activeId] : undefined) ?? active?.title ?? 'untitled session'}
        breadcrumb={activeBlueprintId ?? 'no blueprint'}
        breadcrumbTitle={
          activeBlueprintId ? 'Agent blueprint · click to view or edit' : 'Pick a blueprint for this session'
        }
        ribbon={[{ id: 'main', label: 'main' }]}
        activeRibbonId={activeScope}
        onSelectRibbon={setActiveScope}
        onRenameSession={(sessionId, next) => void rename(sessionId, next)}
        panel={panel}
        obsTab={obsTab}
        artifactCount={activePill?.artifactCount}
        contextPercent={activePill?.contextPercent}
        {...(panel === 'console'
          ? { dock: <ConsoleDock onClose={() => setPanel(null)} /> }
          : {})}
        agentCount={connectedCount}
        {...(connections ? { connections } : {})}
        {...(activeConnectionId ? { activeConnectionId } : {})}
        {...(onSwitchConnection ? { onSwitchConnection } : {})}
        onOpenSettings={() => setPanel('settings')}
        onOpenSearch={() => setSearchOpen(true)}
        onTogglePanel={(next) => {
          // 'artifacts'/'ctx' deep-link into the SAME observability layer on a
          // specific tab (proto tgArtifacts/tgTelemetry: unlike the eye icon,
          // neither ever CLOSES the layer — they only open it / switch tabs).
          if (next === 'artifacts' || next === 'context') {
            setPanel('obs');
            setObsTab(next === 'artifacts' ? 'artifacts' : 'context');
            return;
          }
          setPanel((cur) => (cur === next ? null : next));
        }}
      >
        {sessions.length === 0 ? (
          <p className="sessionview__notice" data-testid="sessions-empty">
            This backend has no sessions yet.
          </p>
        ) : null}

        {state.kind === 'loading' ? <p className="sessionview__notice">Loading…</p> : null}

        {sendError ? (
          <p className="sessionview__error" data-testid="send-error" role="alert">
            Could not send: {sendError}
          </p>
        ) : null}

        {actionError ? (
          <p className="sessionview__error" data-testid="action-error" role="alert">
            {actionError}
          </p>
        ) : null}

        {state.kind === 'missing' && activeId ? (
          <div className="sessionview__missing" data-testid="session-missing" role="alert">
            <p className="sessionview__missingtext">
              This session is no longer on the backend. It was probably deleted elsewhere.
            </p>
            <button
              type="button"
              className="sessionview__removebtn"
              onClick={() => {
                void (async () => {
                  try {
                    await client.deleteSession(activeId);
                  } catch {
                    // Already gone on the backend — removing the row is still
                    // the right outcome.
                  }
                  onForgetSession?.(activeId);
                  setActiveId(null);
                  setState({ kind: 'idle' });
                })();
              }}
            >
              Remove from list
            </button>
          </div>
        ) : null}

        {state.kind === 'failed' ? (
          <p className="sessionview__error" data-testid="transcript-error" role="alert">
            Could not load this session: {state.detail}
          </p>
        ) : null}

        {isIdleLayout ? (
          <>
            <div className="sessionview__idle-scroll" data-testid="transcript-empty">
              <div className="sessionview__idle-headline">
                {idleStarted ? (
                  <FreshStarting hostLabel={activeConnectionLabel} />
                ) : (
                  <FreshHeadline {...(resolvedWorkspaceLabel ? { workspaceLabel: resolvedWorkspaceLabel } : {})} />
                )}
              </div>
            </div>
            <div className="sessionview__idle-dock">{composerElement}</div>
            <div
              className="sessionview__idle-spacer"
              {...(idleStarted ? { 'data-started': 'true' } : {})}
            />
          </>
        ) : (
          <>
            {state.kind === 'loaded' && transcriptMessages.length > 0 ? (
              <Transcript messages={transcriptMessages} />
            ) : null}
            {composerElement}
          </>
        )}
        <Layer
          open={panel === 'settings'}
          title="Settings"
          headerIcon={
            // The prototype's settings gear is --t-tx (muted), not the
            // Layer default cyan (that default is right for e.g. obs's eye).
            <span style={{ color: 'var(--t-tx)' }}>
              <Icon name="tool" size={14} />
            </span>
          }
          size="settings"
          onClose={() => setPanel(null)}
        >
          <Settings
            client={client}
            {...(connections ? { connections } : {})}
            {...(activeConnectionId ? { activeConnectionId } : {})}
            {...(activePill?.contextPercent !== undefined
              ? { contextPercent: activePill.contextPercent }
              : {})}
            {...(activePill?.artifactCount !== undefined
              ? { artifactCount: activePill.artifactCount }
              : {})}
            onOpenObservability={() => setPanel('obs')}
          />
        </Layer>

        <Layer
          open={panel === 'obs'}
          title="observability"
          headerIcon={<Icon name="eye" size={14} />}
          headerMeta={<ObservabilityTrace />}
          windowControls
          onClose={() => setPanel(null)}
        >
          {observabilityData ? (
            <Observability
              key={obsTab ?? 'default'}
              data={observabilityData}
              showTraceHeader={false}
              {...(obsTab ? { initialTab: obsTab } : {})}
            />
          ) : (
            <p className="sessionview__notice">Loading observability…</p>
          )}
        </Layer>

        <FilesLayer
          client={client}
          open={panel === 'files'}
          {...(filesWorkspaceId ? { workspaceId: filesWorkspaceId } : {})}
          {...(filesWorkspaceLabel ? { workspaceLabel: filesWorkspaceLabel } : {})}
          onAttach={attachFileToComposer}
          onClose={() => setPanel(null)}
        />

        <BlueprintWindow
          blueprintId={activeBlueprintId ?? null}
          client={client}
          open={panel === 'blueprint'}
          onClose={() => setPanel(null)}
        />
        <SearchDialog
          open={searchOpen}
          sessions={sessions}
          workspaces={workspaces}
          onChooseSession={setActiveId}
          onClose={() => setSearchOpen(false)}
        />
        <NewDialog
          client={client}
          open={newOpen}
          workspaces={workspaces}
          {...(newWorkspaceId ? { initialWorkspaceId: newWorkspaceId } : {})}
          onCreateSession={createFromDialog}
          onCreateWorkspace={createWorkspaceFromDialog}
          onClose={() => setNewOpen(false)}
        />
      </AppShell>
    </RailActionsProvider>
  );
}

/** Group sessions by workspace, preserving backend order within each group. */
function groupByWorkspace(
  sessions: Session[],
  workspaces: Workspace[],
  renamed: Record<string, string> = {},
  pinnedIds: ReadonlySet<string> = new Set(),
  renamedWorkspaces: Record<string, string> = {},
  pinnedWorkspaceIds: ReadonlySet<string> = new Set(),
  removedWorkspaceIds: ReadonlySet<string> = new Set(),
): RailGroup[] {
  const labels = new Map<string, string>();
  for (const ws of workspaces) {
    if (ws.id) {
      labels.set(ws.id, renamedWorkspaces[ws.id] ?? workspaceDisplayLabel(ws.id, workspaces));
    }
  }
  const groups = new Map<string, RailSession[]>();
  for (const session of sessions) {
    const key = session.workspace_id || 'ungrouped';
    if (removedWorkspaceIds.has(key)) continue;
    const rows = groups.get(key) ?? [];
    rows.push({
      id: session.id,
      title: renamed[session.id] ?? session.title ?? session.id,
      status: toStatus(session.status),
      age: session.updated_at ? relativeAge(session.updated_at) : '',
      ...(pinnedIds.has(session.id) ? { pinned: true } : {}),
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
    ...(pinnedWorkspaceIds.has(id) ? { pinned: true } : {}),
  }));
}

function workspaceDisplayLabel(workspaceId: string, workspaces: Workspace[]): string {
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const root = (workspace as { root_path?: string } | undefined)?.root_path;
  return root ? shortenPath(root) : workspace?.name || workspaceId;
}

/** Render a filesystem root the way the prototype does: home as `~`, forward
 *  slashes, so a Windows path reads like the design's `~/rollups`. */
export function shortenPath(root: string): string {
  const normalized = root.replace(/\\/g, '/');
  const home = /^([A-Za-z]:)?\/Users\/[^/]+/.exec(normalized);
  const shortened = home ? normalized.replace(home[0], '~') : normalized;
  return shortened.replace(/\/+$/, '');
}

function connectionDisplayLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname || baseUrl;
  } catch {
    return baseUrl;
  }
}

function pinsBackendKey(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function loadPins(baseUrl: string): Set<string> {
  return loadStoredPins(PINS_STORAGE_KEY, baseUrl);
}

function loadWorkspacePins(baseUrl: string): Set<string> {
  return loadStoredPins(WORKSPACE_PINS_STORAGE_KEY, baseUrl);
}

function loadStoredPins(storageKey: string, baseUrl: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Set();
    const ids = (parsed as Record<string, unknown>)[pinsBackendKey(baseUrl)];
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function savePins(baseUrl: string, pins: ReadonlySet<string>): void {
  saveStoredPins(PINS_STORAGE_KEY, baseUrl, pins);
}

function saveWorkspacePins(baseUrl: string, pins: ReadonlySet<string>): void {
  saveStoredPins(WORKSPACE_PINS_STORAGE_KEY, baseUrl, pins);
}

function saveStoredPins(storageKey: string, baseUrl: string, pins: ReadonlySet<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const byBackend =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? { ...(parsed as Record<string, unknown>) }
        : {};
    byBackend[pinsBackendKey(baseUrl)] = [...pins];
    localStorage.setItem(storageKey, JSON.stringify(byBackend));
  } catch {
    // Pinning remains usable for this render when storage is unavailable.
  }
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
