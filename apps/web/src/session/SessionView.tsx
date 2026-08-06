import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  fetchArtifactLineage,
  fetchLmConfig,
  fetchSessionAgentTasks,
  fetchSessionArtifacts,
  fetchSessionContextState,
  fetchSessionTrace,
  mergeMessages,
  prependOlderPage,
  subscribeSessionMessageEvents,
  subscribeSessionTraceEvents,
  type Client,
  type Message,
  type RelayStatus,
  type Session,
  type SessionAgentTask,
  type SessionArtifactVersion,
  type Workspace,
} from '@clio/core';
import type { AsyncRunItem } from '../composer/AsyncRunsPopover';
import type { PickerItem } from '../composer/Picker';
import { Composer, type ApprovalMode, type ComposerMode, type QueuedMessage } from '../composer/Composer';
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
import {
  buildObservabilityTrace,
  mergeTimelineRows,
  timelineRowFromSessionTraceEvent,
} from '../observability/build';
import { Settings } from '../settings/Settings';
import type { AgentStatus, ObsNavigation, ObservabilityData } from '../observability/types';
import { Transcript } from '../transcript/Transcript';
import type { ChildPreview } from '../transcript/parts/HandoffPart';
import { DetailSlot } from '../detail/DetailSlot';
import { headVersion, mintArtifactRecord, routeFromLineage } from '../detail/mintRecord';
import { fetchArtifactPreview } from '../detail/preview';
import type { ArtifactRecord } from '../detail/types';
import {
  CHILD_PREVIEW_MAX_CONCURRENT,
  applyChildPreviewEvent,
  findAgentTaskByHandle,
  selectRunningHandoffHandles,
  selectSubscriptionSlots,
  type ChildPreviewAccumulator,
} from './childPreview';
import { AgentPeekView } from './AgentPeekView';
import { BlueprintWindow } from './BlueprintWindow';
import { ChildFocusView } from './ChildFocusView';
import { ConsoleDock } from './ConsoleDock';
import { applyMessageLifecycleEvent } from './messageEvents';
import {
  emptyNavHistoryState,
  lookupScroll,
  nextNavHistoryState,
  pushFocusEntry,
  readNavHistoryState,
  scrollKeyFor,
  truncateFocusAt,
  wrapNavHistoryState,
  type FocusEntry,
} from './navHistory';
import {
  openRightEntry,
  patchTopArtifact,
  rightEntryLabel,
  type RightStackEntry,
} from './rightStack';
import { FilesLayer } from './FilesLayer';
import { FreshHeadline, FreshStarting, SuggestedPrompts, type FreshStarter } from './FreshState';
import { NewDialog, RemoveWorkspaceConfirm, SearchDialog } from './SessionDialogs';
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
  /** The raw rows behind asyncCount — backs the async chip's runs popover. */
  asyncTasks?: SessionAgentTask[];
  contextPercent?: number;
  /** Raw token numbers behind contextPercent — Settings' Metrics page renders
   * the same "82.1k / 200k" shape the prototype's context row carries. */
  contextTokens?: number;
  contextLimit?: number;
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

/**
 * Typed outcome for a fetch whose FAILURE must stay distinguishable from a
 * genuinely empty success. `optionalFetch`'s `null` collapses both into the
 * same falsy value — which is exactly how a slow/failed trace read under
 * 3-way concurrent-session contention rendered as a confident "no trace
 * recorded" while the backend actually held 167 real trace events (round-6
 * CONCURRENCY finding,
 * screenshots/round6/2026-08-06_03-25-28-CONCURRENCY-transcript.png). Callers
 * that only ever wanted "best-effort, don't care why" keep using
 * optionalFetch; callers that render an empty-state CLAIM from the result
 * (obs layer, model pill) use this instead so they can render an honest
 * "unresolved" state rather than fabricate an empty fact.
 */
type FetchOutcome<T> = { ok: true; value: T } | { ok: false };

function fetchOutcome<T>(request: () => Promise<T>): Promise<FetchOutcome<T>> {
  return Promise.resolve()
    .then(request)
    .then((value): FetchOutcome<T> => ({ ok: true, value }))
    .catch((): FetchOutcome<T> => ({ ok: false }));
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'loaded';
      messages: Message[];
      // Progressive load bookkeeping (#232 paging; owner 2026-08-06):
      // `olderCursor` is the backend's `next_cursor` from the last page
      // fetched — a real message id when older history remains
      // un-backfilled, null once the ledger's start has been reached.
      // `loadingOlder` drives no UI today (the backfill is silent
      // background work, never a fabricated placeholder) but stays
      // visible on state for tests/devtools to assert against honestly.
      olderCursor: string | null;
      loadingOlder: boolean;
    }
  // A 404 is its own state: the row points at something the backend no longer
  // has, which is actionable (remove it) rather than merely broken.
  | { kind: 'missing' }
  | { kind: 'failed'; detail: string };

/** The newest-page size for progressive transcript load — enough to fill a
 *  typical viewport without a visible "cut" for a short conversation, small
 *  enough that a long one still paints its tail well under a second. */
const TRANSCRIPT_PAGE_SIZE = 50;

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
  const [files, setFiles] = useState<PickerItem[]>([]);
  const [sending, setSending] = useState(false);
  // Messages held back while `sending` is true — the composer's mainQ tray.
  // `sending` is this client's own send-round-trip window (POST -> load ->
  // refreshPill), not the full multi-step turn the backend may still be
  // running; see the queue effect below for what that means honestly.
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newWorkspaceId, setNewWorkspaceId] = useState<string | undefined>(undefined);
  // A rail/search request for a SPECIFIC workspace's files — separate from
  // newWorkspaceId (the +new dialog's own pre-selection) so the two never
  // cross-contaminate: asking to view workspace B's files must not silently
  // change what the +new dialog offers next, and vice versa. Wins over the
  // active session's own workspace while set; the topbar's plain "files"
  // toggle clears it so that control always means "this session's files".
  const [filesWorkspaceRequest, setFilesWorkspaceRequest] = useState<string | undefined>(
    undefined,
  );
  // The workspace group-menu's "remove workspace" — gated on the prototype's
  // wsConfirmOpen modal (SessionDialogs.RemoveWorkspaceConfirm) rather than
  // firing the DELETE on click; null = nothing pending.
  const [pendingRemoveWorkspaceId, setPendingRemoveWorkspaceId] = useState<string | null>(null);
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
  // Paired with `detail`: whether the session-RECORD read (GET /v1/sessions/
  // {id}) that carries `model` has actually SUCCEEDED this visit. The
  // composer's model pill needs this to tell "the record says no per-session
  // model" (a real fact) from "we couldn't read the record yet/at all" (round-
  // 6 CONCURRENCY finding: a failed read rendered "model not set" while
  // claude_code/cc-sonnet was actually bound) — `detail` alone collapses both
  // into the same null/undefined `model` field.
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'loaded' | 'failed'>(
    'idle',
  );
  const [modelOptions, setModelOptions] = useState<SelectOption[]>([]);
  const [modelProviders, setModelProviders] = useState<ProviderModelGroup[]>([]);
  const [thinkingLevel, setThinkingLevel] = useState<string | undefined>(undefined);
  const [activeScope, setActiveScope] = useState('main');
  // The prototype's CENTER drill-in stack (focus[]): each entry is a child
  // session opened from its Call box for maximum reading + steering. A
  // breadcrumb ribbon navigates back; selecting another session wipes it.
  const [focus, setFocus] = useState<{ sessionId: string; agent: string }[]>([]);
  const [childView, setChildView] = useState<{
    sessionId: string;
    messages: Message[];
    status: string;
    // The child session's own real created_at/updated_at (getSession) — the
    // center child view's settled footer computes its "completed ✓ <dur>"
    // duration from these, never a guessed number.
    createdAt?: string;
    updatedAt?: string;
  } | null>(null);
  // The prototype's RIGHT panel stack (stack[]): artifact detail records
  // plus the shift-click agent peek. Opening from a chip/Call box REPLACES;
  // provenance navigation PUSHES (see session/rightStack.ts).
  const [rightStack, setRightStack] = useState<RightStackEntry[]>([]);
  const [pillState, setPillState] = useState<ComposerPillState | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => loadPins(client.baseUrl));
  const [pinnedWorkspaceIds, setPinnedWorkspaceIds] = useState<Set<string>>(() =>
    loadWorkspacePins(client.baseUrl),
  );
  const [removedWorkspaceIds, setRemovedWorkspaceIds] = useState<Set<string>>(new Set());
  const [createdWorkspaces, setCreatedWorkspaces] = useState<Record<string, string>>({});
  // Which Settings page to land on next open — the gear opens whatever page
  // was open last (undefined leaves Settings' own default), the rail
  // footer's "relay" cell always wants 'relays' specifically.
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  const [relayStatus, setRelayStatus] = useState<RelayStatus | undefined>(undefined);

  // This backend's own configured relay + a fresh reachability probe (GET
  // /v1/relay/status, clio-agent#1179) — feeds the rail footer's "relay"
  // dot the same way RelaysPage's own row does. One-shot per connection,
  // same shape as the provider/model catalogue fetch above; the relay's
  // own reachability is not expected to flap within a session's lifetime.
  useEffect(() => {
    let cancelled = false;
    setRelayStatus(undefined);
    void optionalFetch(() => client.relayStatus()).then((status) => {
      if (!cancelled && status) setRelayStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

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
      const [
        agentsOutcome,
        sessionRunsOutcome,
        serversOutcome,
        contextOutcome,
        agentTasksOutcome,
        artifactOutcome,
        rootTraceOutcome,
      ] = await Promise.all([
        fetchOutcome(() => client.agents()),
        fetchOutcome(() => client.sessionTasks(sessionId)),
        fetchOutcome(() => client.mcpServers()),
        fetchOutcome(() => fetchSessionContextState(client, sessionId, scope)),
        fetchOutcome(() => fetchSessionAgentTasks(client, sessionId)),
        fetchOutcome(() => fetchSessionArtifacts(client, sessionId, { includeChildren: true })),
        fetchOutcome(() => fetchSessionTrace(client, sessionId, { limit: 2000 })),
      ]);
      const agents = agentsOutcome.ok ? agentsOutcome.value : null;
      const sessionRuns = sessionRunsOutcome.ok ? sessionRunsOutcome.value : null;
      const servers = serversOutcome.ok ? serversOutcome.value : null;
      const context = contextOutcome.ok ? contextOutcome.value : null;
      const agentTasksResult = agentTasksOutcome.ok ? agentTasksOutcome.value : null;
      const artifactResult = artifactOutcome.ok ? artifactOutcome.value : null;
      const rootTrace = rootTraceOutcome.ok ? rootTraceOutcome.value : null;
      const agentTasks = agentTasksResult?.tasks ?? [];
      const artifactRecords = artifactResult?.artifacts ?? [];
      // The observed tree: the parent's own trace plus EVERY child's — child
      // ids from the agent-task rows' child_session_id ∪ the artifacts
      // route's child_session_ids (gact-tui#356: main aggregates; a child
      // session viewed directly simply has no children and keeps its own
      // scope). Each trace is the wire with per-tool occurred_at + real
      // duration_ms; a child whose trace read fails contributes no rows
      // rather than fabricated ones.
      const childSessionIds = [
        ...new Set([
          ...agentTasks.map((task) => task.child_session_id),
          ...(artifactResult?.child_session_ids ?? []),
        ]),
      ].filter((id): id is string => Boolean(id) && id !== sessionId);
      const childTraceOutcomes = await Promise.all(
        childSessionIds.map(async (childSessionId) => ({
          sessionId: childSessionId,
          outcome: await fetchOutcome(() => fetchSessionTrace(client, childSessionId, { limit: 2000 })),
        })),
      );
      const childTraces = childTraceOutcomes.map(({ sessionId: id, outcome }) => ({
        sessionId: id,
        events: outcome.ok ? (outcome.value.events ?? []) : [],
      }));
      // Whether the timeline/runs/tools/gantt tabs can trust their own zero.
      // Only the PRIMARY reads that actually feed those tabs count: the
      // session's own trace, every child's trace, and the real agent-task
      // delegations (agentTasksOutcome — taskRuns). `sessionTasks`
      // (existingRuns, a supplementary/legacy TODO-style source folded into
      // the same tab) failing does NOT flip this — a backend that simply
      // doesn't carry that secondary endpoint would otherwise permanently
      // read "unavailable" for a genuinely healthy session. agents/servers/
      // context failing degrades OTHER tabs, which already have their own
      // honest fallbacks (ContextTab's "not reported", the legacy tools
      // catalog simply reading empty). A FAILED read here must never render
      // as the same "no trace recorded" a genuinely empty session earns.
      const traceReadFailed =
        !rootTraceOutcome.ok ||
        !agentTasksOutcome.ok ||
        childTraceOutcomes.some(({ outcome }) => !outcome.ok);
      const trace = buildObservabilityTrace({
        rootSessionId: sessionId,
        traces: [{ sessionId, events: rootTrace?.events ?? [] }, ...childTraces],
        agentTasks,
        artifacts: artifactRecords,
      });
      const spanById = new Map(trace.spans.map((span) => [span.id, span]));
      const taskRuns = agentTasks.flatMap((task) => {
        const id = task.task_id || task.id;
        if (!id) return [];
        const label = task.run_label || task.agent_ref?.expert_id;
        const host = task.host || task.placement;
        const span = spanById.get(id);
        // Real, derived-only description — never a fabricated summary of what
        // the task actually did (SessionAgentTask carries no such field).
        const requestingExpert = task.agent_ref?.requesting_expert_id;
        const artifactCount = span?.artifacts;
        const description = [
          requestingExpert ? `requested by ${requestingExpert}` : null,
          artifactCount ? `${artifactCount} artifact${artifactCount === 1 ? '' : 's'}` : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(' · ');
        return [
          {
            id,
            agent: task.agent_ref?.expert_id ?? '',
            state: task.status || task.live_state || 'unknown',
            ...(label ? { label } : {}),
            ...(host ? { host } : {}),
            ...(span?.duration ? { duration: span.duration } : {}),
            ...(description ? { description } : {}),
            ...(span?.nav ? { nav: span.nav } : {}),
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
          ? Math.round(usedFraction * 100)
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
        // GET /v1/mcp/servers returns `tools` as a plain string[] (tool
        // names), never `{name, description}` objects — mapping `tool.name`
        // on a string always read `undefined`, rendering every row blank.
        toolsByExpert: Object.fromEntries(
          (servers?.servers ?? []).map((server) => {
            const row = server as {
              name?: string;
              id?: string;
              tools?: Array<string | { name?: string; description?: string }>;
            };
            return [
              row.name ?? row.id ?? 'server',
              (row.tools ?? []).flatMap((tool) => {
                if (typeof tool === 'string') return tool ? [{ name: tool }] : [];
                if (!tool.name) return [];
                return [{ name: tool.name, ...(tool.description ? { description: tool.description } : {}) }];
              }),
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
        ...(traceReadFailed ? { traceReadFailed: true } : {}),
      };
    },
    [client],
  );

  const observabilityMessages = state.kind === 'loaded' ? state.messages : NO_MESSAGES;

  // Settings' Metrics page renders the prototype's "tool calls" row from the
  // real transcript already loaded for this session — the same `tool_call`
  // parts the Observability tools tab counts (obsToolCount backs both rows
  // in the prototype's own JS) — with no extra network round-trip.
  const sessionToolCallCount = useMemo(
    () =>
      observabilityMessages.reduce(
        (total, message) =>
          total + message.parts.filter((part) => part.type === 'tool_call').length,
        0,
      ),
    [observabilityMessages],
  );

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

  // Auto-retry the trace/runs/tools read exactly ONCE after a short backoff
  // when it comes back FAILED (ObservabilityData.traceReadFailed) — never
  // looping; a read that keeps failing needs the human "retry now" click
  // (TraceUnavailable's button below) rather than an infinite poll. A fresh
  // session/scope, or reopening the panel, earns a fresh attempt.
  const obsAutoRetriedRef = useRef(false);
  useEffect(() => {
    obsAutoRetriedRef.current = false;
  }, [activeId, activeScope, panel]);

  useEffect(() => {
    if (panel !== 'obs' || !activeId || !obs?.traceReadFailed || obsAutoRetriedRef.current) return;
    obsAutoRetriedRef.current = true;
    const timer = window.setTimeout(() => {
      void loadObservability(activeId, activeScope, observabilityMessages).then(setObs);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [panel, activeId, activeScope, obs?.traceReadFailed, loadObservability, observabilityMessages]);

  // Manual retry — the TraceUnavailable button's escape hatch, same call the
  // effects above already make.
  const retryObsTrace = useCallback(() => {
    if (!activeId) return;
    void loadObservability(activeId, activeScope, observabilityMessages).then(setObs);
  }, [activeId, activeScope, observabilityMessages, loadObservability]);

  useEffect(() => {
    if (panel !== 'obs' || !activeId || typeof EventSource === 'undefined') return;
    let cancelled = false;
    const subscription = subscribeSessionTraceEvents(client.sseUrl(activeId), (event) => {
      const row = timelineRowFromSessionTraceEvent(event);
      if (row) {
        setLiveTraceRows((previous) => {
          if (row.sourceId && previous.some((item) => item.sourceId === row.sourceId))
            return previous;
          const next = [...previous, row];
          return next.length > 500 ? next.slice(next.length - 500) : next;
        });
      }

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

  // Workspace files back the composer's `@` picker (client.workspaceFiles()).
  // No active session/workspace yet: leave the list empty so `@` simply
  // does not open, same convention as an unservable commands read above.
  useEffect(() => {
    let cancelled = false;
    const workspaceId = sessions.find((s) => s.id === activeId)?.workspace_id;
    if (!workspaceId) {
      setFiles([]);
      return;
    }
    void (async () => {
      try {
        const result = await client.workspaceFiles(workspaceId, { limit: 500 });
        if (cancelled) return;
        setFiles(
          (result.files ?? [])
            // clio's live wire types directories `"dir"` (probed against
            // 127.0.0.1:17900), not `"directory"` — filtering on the latter
            // alone is a no-op against the real backend, so both spellings
            // are excluded here.
            .filter((file) => file.type !== 'dir' && file.type !== 'directory')
            .map((file) => {
              const parts = file.path.split(/[\\/]/).filter(Boolean);
              const name = parts[parts.length - 1] ?? file.path;
              const dir = parts.slice(0, -1).join('/');
              return { id: file.path, label: name, ...(dir ? { detail: `${dir}/` } : {}) };
            }),
        );
      } catch {
        if (!cancelled) setFiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, activeId, sessions]);

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
        next.asyncTasks = tasksResult.value.tasks;
        next.asyncCount = tasksResult.value.tasks.filter(
          (task) => !TERMINAL_AGENT_TASK_STATUSES.has(String(task.status).toLowerCase()),
        ).length;
      }

      if (contextResult.status === 'fulfilled') {
        // used_pct AND pct_used are RATIOS of window_tokens — declared in
        // context_types (X / window_tokens) and emitted exactly so by the
        // server (routes/context.py: live_tokens / window, both sites).
        // No mixed-unit guessing: a 0.5 ratio and "0.5%" are
        // indistinguishable to a heuristic, so the wire contract is the
        // only authority. (The old "7.4 meant 7.4%" fixture lore misread
        // the wire; the fixture is repinned to 0.074.)
        const used = contextResult.value.used_pct ?? contextResult.value.pct_used;
        if (typeof used === 'number' && Number.isFinite(used)) {
          // One decimal of precision so the render can tell a true 0% from a
          // sub-1% reading ('<1%') — an integer collapsed both to 0.
          next.contextPercent = Math.round(used * 1000) / 10;
        }
        const tokens = contextResult.value.used_tokens ?? contextResult.value.live_tokens;
        if (typeof tokens === 'number' && Number.isFinite(tokens)) {
          next.contextTokens = tokens;
        }
        const limit = contextResult.value.window_tokens;
        if (typeof limit === 'number' && Number.isFinite(limit)) {
          next.contextLimit = limit;
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

  // ---- Progressive transcript load (#232 paging) + center-nav (Feature C)
  // shared bookkeeping. Refs, not state: none of this drives a render on
  // its own — it only feeds imperative DOM scrollTop reads/writes and
  // `window.history` calls the effects/callbacks below make.
  //
  // The MAIN session's own `.transcript` scroll container — attached only
  // while `focus` is empty (ChildFocusView replaces it otherwise). The
  // progressive-load backfill below anchors scroll through THIS ref
  // specifically (never the shared one) because a backfill for a session
  // the user has since drilled away from has no visible container to keep
  // steady, and must not be allowed to fight over one that belongs to an
  // unrelated child view.
  const mainTranscriptScrollRef = useRef<HTMLDivElement | null>(null);
  // Whichever center view is CURRENTLY on screen — main or a focused
  // child, mutually exclusive renders (see the JSX below). Center-nav
  // reads/writes scrollTop through this one ref regardless of which it is.
  const visibleTranscriptScrollRef = useRef<HTMLDivElement | null>(null);
  const setMainTranscriptRef = useCallback((el: HTMLDivElement | null) => {
    mainTranscriptScrollRef.current = el;
    visibleTranscriptScrollRef.current = el;
  }, []);
  // Mirrors `history.state` — the single source of truth `navigateCenter`
  // and the `popstate` handler both read and write.
  const navHistoryRef = useRef(emptyNavHistoryState(null));
  // Armed by navigateCenter/popstate immediately before an activeId change
  // they already own the FULL transition for (focus + history already
  // set); consumed exactly once by the `[activeId, ...]` effect below so
  // it does not also wipe `focus` / reset the history baseline for a
  // transition that already set both correctly.
  const suppressFocusResetRef = useRef(false);
  // The scroll-map key whose remembered position is still owed a restore
  // once its content actually paints — a freshly (re-)focused child needs
  // its own async fetch to land first (see the two restore effects below).
  const pendingScrollRestoreKeyRef = useRef<string | null>(null);
  // Kept in sync with `activeId` so `load`'s backfill loop (a long-running
  // background async loop) can tell whether the session it is still
  // fetching for is still the active one before touching state.
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Backfill older pages under the newest-page paint `load` already did,
  // one `before`-cursor page at a time, until the backend reports no more
  // (`next_cursor: null`). Runs silently in the background; a fetch
  // failure partway through leaves the loaded prefix exactly as correct as
  // it already was rather than retry-looping or fabricating the gap.
  const backfillOlder = useCallback(
    async (sessionId: string, startCursor: string) => {
      let cursor: string | null = startCursor;
      while (cursor) {
        if (activeIdRef.current !== sessionId) return;
        setState((prev) => (prev.kind === 'loaded' ? { ...prev, loadingOlder: true } : prev));
        let page;
        try {
          page = await client.messages(sessionId, { limit: TRANSCRIPT_PAGE_SIZE, before: cursor });
        } catch {
          if (activeIdRef.current === sessionId) {
            setState((prev) => (prev.kind === 'loaded' ? { ...prev, loadingOlder: false } : prev));
          }
          return;
        }
        if (activeIdRef.current !== sessionId) return;
        const pageMessages = page.messages ?? [];
        const nextCursor = page.next_cursor ?? null;
        const el = mainTranscriptScrollRef.current;
        const prevScrollHeight = el?.scrollHeight ?? 0;
        const prevScrollTop = el?.scrollTop ?? 0;
        // flushSync forces the DOM to actually reflect the prepended page
        // before the scrollHeight comparison below — without it the
        // browser could paint the taller content BEFORE the compensating
        // scrollTop write lands, which is exactly the visible "jump" this
        // exists to prevent (owner: "scroll anchored so content doesn't
        // jump").
        flushSync(() => {
          setState((prev) =>
            prev.kind === 'loaded'
              ? {
                  ...prev,
                  messages: prependOlderPage(prev.messages, pageMessages),
                  olderCursor: nextCursor,
                  loadingOlder: false,
                }
              : prev,
          );
        });
        if (el) {
          const delta = el.scrollHeight - prevScrollHeight;
          el.scrollTop = prevScrollTop + delta;
        }
        cursor = nextCursor;
      }
    },
    [client],
  );

  const load = useCallback(
    async (sessionId: string) => {
      setState({ kind: 'loading' });
      setDetail(null);
      setDetailStatus('loading');
      // The record carries model + approval_mode, which the composer renders.
      // A failure here must not fail the transcript, so it is read separately.
      void Promise.resolve()
        .then(() => client.getSession(sessionId))
        .then((row) => {
          setDetail(row as unknown as SessionDetail);
          setDetailStatus('loaded');
        })
        // A backend that cannot serve the record leaves the composer without
        // model/approval controls rather than failing the transcript with it —
        // but `detailStatus` stays 'failed' rather than silently 'loaded', so
        // the model pill knows this session's `detail.model` is UNRESOLVED,
        // not "the record really has none" (round-6 CONCURRENCY finding).
        .catch(() => setDetailStatus('failed'));
      try {
        // Progressive paint (#232 paging; owner 2026-08-06 "small detail,
        // big presentation help"): fetch the NEWEST page first so the
        // transcript's tail — what a returning user actually wants to see
        // — paints immediately instead of blocking on the whole ledger.
        // Older pages backfill in the background via backfillOlder.
        const first = await client.messages(sessionId, { limit: TRANSCRIPT_PAGE_SIZE });
        if (activeIdRef.current !== sessionId) return;
        const firstMessages = first.messages ?? [];
        const firstCursor = first.next_cursor ?? null;
        setState({
          kind: 'loaded',
          messages: firstMessages,
          olderCursor: firstCursor,
          loadingOlder: false,
        });
        if (firstCursor) {
          void backfillOlder(sessionId, firstCursor);
        }
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
    [client, backfillOlder],
  );

  // The single place that changes "what's centered" as a NAVIGATION (Feature
  // C — Call-box push, breadcrumb pop/root, an obs agent-jump), as opposed
  // to `setFocus`/`setActiveId` being driven by data arriving elsewhere.
  // Captures the scrollTop of the view being LEFT, pushes (or replaces) ONE
  // history entry carrying both dimensions (`activeId` + `focus`) together,
  // then applies the new state. A `popstate` must NEVER call this — see the
  // handler below, which applies a popped state directly and never re-enters
  // here (the loop guard: "popstate applies state, doesn't re-push").
  const navigateCenter = useCallback(
    (next: { activeId: string | null; focus: FocusEntry[] }, mode: 'push' | 'replace' = 'push') => {
      const leavingScrollTop = visibleTranscriptScrollRef.current?.scrollTop ?? 0;
      const nextHistory = nextNavHistoryState(navHistoryRef.current, next, leavingScrollTop);
      if (typeof window !== 'undefined' && window.history) {
        // History entries are IMMUTABLE snapshots at push time — the scroll
        // map computed above (which now includes the position being left)
        // has to be written onto the entry CURRENTLY at the top of the
        // stack before advancing, or a later Back to it would still see
        // whatever (possibly empty) scroll map it was pushed/replaced with
        // originally. replaceState touches only the current entry, so this
        // never grows the stack.
        window.history.replaceState(
          wrapNavHistoryState({ ...navHistoryRef.current, scroll: nextHistory.scroll }),
          '',
        );
        if (mode === 'push') {
          window.history.pushState(wrapNavHistoryState(nextHistory), '');
        } else {
          window.history.replaceState(wrapNavHistoryState(nextHistory), '');
        }
      }
      navHistoryRef.current = nextHistory;
      pendingScrollRestoreKeyRef.current = scrollKeyFor(next.activeId, next.focus);
      if (next.activeId !== activeId) {
        suppressFocusResetRef.current = true;
        setActiveId(next.activeId);
      }
      setFocus(next.focus);
    },
    [activeId],
  );

  // Applies browser Back/Forward. Reads the popped state verbatim
  // (readNavHistoryState) and sets it directly — it must never construct a
  // NEW NavHistoryState (nextNavHistoryState) or call pushState/
  // replaceState, or Back would immediately re-push Forward and the two
  // buttons would stop working.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = (event: PopStateEvent) => {
      const popped = readNavHistoryState(event.state);
      if (!popped) return; // not one of ours (foreign entry / initial blank) — ignore
      navHistoryRef.current = popped;
      pendingScrollRestoreKeyRef.current = scrollKeyFor(popped.activeId, popped.focus);
      if (popped.activeId !== activeId) {
        suppressFocusResetRef.current = true;
        setActiveId(popped.activeId);
      }
      setFocus(popped.focus);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [activeId]);

  // The prototype's obsTl row builder (`r.go`): 'agent' switches the active
  // session and closes the layer, 'message' closes the layer and scrolls the
  // transcript to that message. The obs Layer is an overlay — Transcript
  // stays mounted underneath it the whole time, so the target element is
  // already in the DOM; only the overlay covering it needs to go away.
  const handleObsNavigate = useCallback(
    (nav: ObsNavigation) => {
      setPanel(null);
      if (nav.kind === 'agent') {
        // Same channel as a Call-box push (Feature C): one history entry,
        // scroll of the view being left captured first.
        navigateCenter({ activeId: nav.targetId, focus: [] });
        return;
      }
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-message-id="${nav.targetId}"]`)
          ?.scrollIntoView({ block: 'center' });
      });
    },
    [navigateCenter],
  );

  useEffect(() => {
    if (!activeId) {
      setPillState(null);
      return;
    }
    if (suppressFocusResetRef.current) {
      // This activeId change was already a full, correct transition applied
      // by navigateCenter/popstate (focus + history state already set) —
      // wiping focus here would clobber a restored/obs-jumped stack.
      suppressFocusResetRef.current = false;
    } else {
      // A plain rail click or the very first mount: not a center-nav
      // transition (Feature C), so this session becomes a fresh history
      // baseline (the prototype's own selectSession wipes the drill-in
      // stack outright). replaceState, not pushState — switching sessions
      // must never grow a "back into a different session's old focus
      // history" trail.
      setFocus([]);
      navHistoryRef.current = emptyNavHistoryState(activeId);
      if (typeof window !== 'undefined' && window.history) {
        window.history.replaceState(wrapNavHistoryState(navHistoryRef.current), '');
      }
    }
    void load(activeId);
    void refreshPill(activeId, activeScope);
  }, [activeId, activeScope, load, refreshPill]);

  // LIVE transcript: the session SSE stream applies message-lifecycle events
  // to the loaded feed as they arrive — streamed text via part.delta, new
  // parts via part.added, and the clean delegation wire's IN-PLACE settle
  // via message.part.updated (the terminal expert_handoff replaces the
  // started part by id; appendPart's upsert-by-id is exactly that). On
  // message.completed/error the feed reconciles against /v1/messages with a
  // key-based merge so racing deltas are never clobbered. Pure application
  // of the server's wire — no dedup, no reshaping (owner rule 2026-08-05).
  useEffect(() => {
    if (!activeId || typeof EventSource === 'undefined') return;
    let cancelled = false;
    const applyToLoaded = (fn: (messages: Message[]) => Message[]) => {
      setState((prev) => (prev.kind === 'loaded' ? { ...prev, messages: fn(prev.messages) } : prev));
    };
    let reconcileTimer: number | undefined;
    const reconcile = () => {
      if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer);
      reconcileTimer = window.setTimeout(() => {
        void client
          .messages(activeId)
          .then((result) => {
            if (!cancelled) applyToLoaded((prev) => mergeMessages(prev, result.messages ?? []));
          })
          .catch(() => {
            // The live feed keeps what it has; the next lifecycle event or a
            // session re-select retries the reconcile.
          });
      }, 250);
    };
    const subscription = subscribeSessionMessageEvents(client.sseUrl(activeId), (event) => {
      // Feed application is the shared pure helper (session/messageEvents.ts);
      // only the side effects stay here.
      applyToLoaded((prev) => applyMessageLifecycleEvent(prev, event) ?? prev);
      switch (event.type) {
        case 'message.created': {
          // The session record may have changed since selection (blueprint
          // activation, model patch) — a page opened before an activation kept
          // reading "no blueprint" forever (owner capture). A turn starting is
          // the natural moment to re-read the record.
          void Promise.resolve()
            .then(() => client.getSession(activeId))
            .then((row) => {
              setDetail(row as unknown as SessionDetail);
              setDetailStatus('loaded');
            })
            // A failed refresh keeps whatever `detail`/`detailStatus` this
            // session already had — never downgrades a known-good last read.
            .catch(() => {});
          break;
        }
        case 'message.completed':
        case 'message.error':
        case 'message.deleted':
          reconcile();
          // The pill (ctx %, artifact count, async tasks) goes stale between
          // send-time refreshes — a settled turn is exactly when its numbers
          // changed (owner: 'artifacts 5 for the whole run', 'ctx 0%').
          void refreshPill(activeId, activeScope);
          break;
        default:
          break;
      }
    });
    return () => {
      cancelled = true;
      if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer);
      subscription.close();
    };
  }, [activeId, client]);

  // Live child-session previews for RUNNING delegations (P4R prototype rule:
  // a Call box must not sit empty while its child streams — children are
  // real sessions with their own SSE wire, so this renders the child's OWN
  // wire, not a client-side fabrication). Keyed by handle_id; SessionView
  // owns subscription lifetime, Transcript/MergedHandoff only ever read the
  // resolved tail. subsRef/accumulatorsRef/taskCacheRef/fetchingRef are
  // mutable bookkeeping the effect below needs across renders without
  // re-triggering itself.
  const [childPreviews, setChildPreviews] = useState<Record<string, ChildPreview>>({});
  const childSubsRef = useRef<Record<string, { close: () => void }>>({});
  const childAccumulatorsRef = useRef<Record<string, ChildPreviewAccumulator>>({});
  const childTaskCacheRef = useRef<Record<string, { childSessionId: string; startedAt?: string }>>({});
  const childFetchingRef = useRef<Set<string>>(new Set());

  const runningHandoffHandles = useMemo(
    () => (state.kind === 'loaded' ? selectRunningHandoffHandles(state.messages) : []),
    [state],
  );

  useEffect(() => {
    if (!activeId || typeof EventSource === 'undefined') return;
    let cancelled = false;
    const runningSet = new Set(runningHandoffHandles);

    // Drop subscriptions/previews for handoffs no longer running — settled
    // (message.part.updated landed on the parent) or vanished from the
    // transcript (a session switch resets `state` before the new one loads).
    for (const handleId of Object.keys(childSubsRef.current)) {
      if (runningSet.has(handleId)) continue;
      childSubsRef.current[handleId]?.close();
      delete childSubsRef.current[handleId];
      delete childAccumulatorsRef.current[handleId];
      setChildPreviews((cur) => {
        if (!(handleId in cur)) return cur;
        const { [handleId]: _drop, ...rest } = cur;
        return rest;
      });
    }

    const openHandleIds = new Set(Object.keys(childSubsRef.current));
    const toOpen = selectSubscriptionSlots(runningHandoffHandles, openHandleIds);
    if (toOpen.length === 0) return;

    void (async () => {
      for (const handleId of toOpen) {
        if (cancelled || childSubsRef.current[handleId]) continue;
        if (Object.keys(childSubsRef.current).length >= CHILD_PREVIEW_MAX_CONCURRENT) break;

        // Resolve the child session id + start time from the agent-task
        // rows refreshPill already fetches; only reach for a dedicated fetch
        // when a running handoff has no entry there yet.
        let resolved = childTaskCacheRef.current[handleId];
        if (!resolved) {
          const fromPill =
            pillState?.sessionId === activeId
              ? findAgentTaskByHandle(pillState.asyncTasks ?? [], handleId)
              : undefined;
          if (fromPill?.child_session_id) {
            resolved = {
              childSessionId: fromPill.child_session_id,
              ...(fromPill.created_at ? { startedAt: fromPill.created_at } : {}),
            };
          } else if (!childFetchingRef.current.has(handleId)) {
            childFetchingRef.current.add(handleId);
            try {
              const { tasks } = await fetchSessionAgentTasks(client, activeId);
              const task = findAgentTaskByHandle(tasks, handleId);
              if (task?.child_session_id) {
                resolved = {
                  childSessionId: task.child_session_id,
                  ...(task.created_at ? { startedAt: task.created_at } : {}),
                };
              }
            } catch {
              // Stays unresolved — the box keeps showing its plain footer,
              // never a guessed destination.
            } finally {
              childFetchingRef.current.delete(handleId);
            }
          }
          if (resolved) childTaskCacheRef.current[handleId] = resolved;
        }

        if (cancelled || !resolved || childSubsRef.current[handleId]) continue;
        if (Object.keys(childSubsRef.current).length >= CHILD_PREVIEW_MAX_CONCURRENT) continue;

        const startedAt = resolved.startedAt;
        childAccumulatorsRef.current[handleId] = { text: '' };
        setChildPreviews((cur) => ({
          ...cur,
          [handleId]: { text: '', ...(startedAt ? { startedAt } : {}) },
        }));

        const subscription = subscribeSessionMessageEvents(
          client.sseUrl(resolved.childSessionId),
          (event) => {
            const next = applyChildPreviewEvent(
              childAccumulatorsRef.current[handleId] ?? { text: '' },
              event,
            );
            childAccumulatorsRef.current[handleId] = next;
            setChildPreviews((cur) => ({
              ...cur,
              [handleId]: { text: next.text, ...(startedAt ? { startedAt } : {}) },
            }));
          },
        );
        childSubsRef.current[handleId] = subscription;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId, client, runningHandoffHandles, pillState]);

  // Hard stop: close every open child-preview subscription on a session
  // switch or unmount. The incremental drop above only fires for handles
  // that fell OUT of the running set — a session switch resets `state` to a
  // fresh load whose messages haven't landed yet, so this is the backstop
  // that guarantees a PREVIOUS session's child connections never outlive it.
  useEffect(() => {
    return () => {
      for (const sub of Object.values(childSubsRef.current)) sub.close();
      childSubsRef.current = {};
      childAccumulatorsRef.current = {};
      childTaskCacheRef.current = {};
      childFetchingRef.current = new Set();
      setChildPreviews({});
    };
  }, [activeId]);

  // The global LM binding (provider + model), the session-model fallback.
  const [globalLm, setGlobalLm] = useState<{ provider?: string; model?: string } | null>(null);
  // Paired with `globalLm` the same way `detailStatus` pairs with `detail` —
  // the model pill must only read "model not set" once THIS read (not just
  // the session record) has genuinely succeeded and come back empty.
  const [globalLmStatus, setGlobalLmStatus] = useState<'idle' | 'loading' | 'loaded' | 'failed'>(
    'idle',
  );
  useEffect(() => {
    let cancelled = false;
    setGlobalLmStatus('loading');
    void Promise.resolve()
      .then(() => fetchLmConfig(client))
      .then((snapshot) => {
        if (!cancelled) {
          setGlobalLm(snapshot as { provider?: string; model?: string });
          setGlobalLmStatus('loaded');
        }
      })
      .catch(() => {
        // No binding readable — `globalLmStatus` stays 'failed' so the model
        // pill renders unresolved rather than fabricating "model not set".
        if (!cancelled) setGlobalLmStatus('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const focusTop = focus.length > 0 ? focus[focus.length - 1]! : null;

  // The focused child's live-ish view: fetched on focus and refreshed while
  // focused (children run in background; their transcript grows under us).
  useEffect(() => {
    if (!focusTop) {
      setChildView(null);
      return;
    }
    let cancelled = false;
    const pull = async () => {
      try {
        const [result, row] = await Promise.all([
          client.messages(focusTop.sessionId),
          Promise.resolve()
            .then(() => client.getSession(focusTop.sessionId))
            .catch(() => null),
        ]);
        if (!cancelled) {
          const sessionRow = row as { status?: unknown; created_at?: unknown; updated_at?: unknown } | null;
          setChildView({
            sessionId: focusTop.sessionId,
            messages: result.messages ?? [],
            status: String(sessionRow?.status ?? ''),
            ...(typeof sessionRow?.created_at === 'string' ? { createdAt: sessionRow.created_at } : {}),
            ...(typeof sessionRow?.updated_at === 'string' ? { updatedAt: sessionRow.updated_at } : {}),
          });
        }
      } catch {
        if (!cancelled) {
          setChildView({ sessionId: focusTop.sessionId, messages: [], status: 'failed' });
        }
      }
    };
    void pull();
    // The child streams over its own session SSE exactly like the main
    // transcript (children are real sessions); the poll stays as the
    // reconcile backstop for everything the part events don't carry
    // (status transitions, adopted messages).
    const applyToChild = (fn: (messages: Message[]) => Message[]) => {
      setChildView((cur) =>
        cur && cur.sessionId === focusTop.sessionId ? { ...cur, messages: fn(cur.messages) } : cur,
      );
    };
    const subscription =
      typeof EventSource !== 'undefined'
        ? subscribeSessionMessageEvents(client.sseUrl(focusTop.sessionId), (event) => {
            applyToChild((prev) => applyMessageLifecycleEvent(prev, event) ?? prev);
          })
        : null;
    const timer = window.setInterval(() => void pull(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      subscription?.close();
    };
  }, [focusTop?.sessionId, client]);

  // Restore scroll on the MAIN transcript once it is the visible view AND
  // its content is loaded — covers both "Back to main" and a fresh
  // session's first paint (which has no recorded position, so
  // lookupScroll naturally resolves to 0/top; see the "apply-without-
  // repush" tests in navHistory.test.ts for the pure half of this).
  useLayoutEffect(() => {
    if (focusTop) return;
    if (state.kind !== 'loaded') return;
    const key = scrollKeyFor(activeId, []);
    if (pendingScrollRestoreKeyRef.current !== key) return;
    const el = visibleTranscriptScrollRef.current;
    if (el) el.scrollTop = lookupScroll(navHistoryRef.current.scroll, key);
    pendingScrollRestoreKeyRef.current = null;
  }, [focusTop, state, activeId]);

  // Restore scroll on a focused CHILD once ITS OWN content has landed — the
  // child pull effect above fetches asynchronously on every focus change,
  // so a Forward into a previously-visited child cannot restore scroll
  // until childView actually matches focusTop again.
  useLayoutEffect(() => {
    if (!focusTop || !childView || childView.sessionId !== focusTop.sessionId) return;
    const key = scrollKeyFor(activeId, focus);
    if (pendingScrollRestoreKeyRef.current !== key) return;
    const el = visibleTranscriptScrollRef.current;
    if (el) el.scrollTop = lookupScroll(navHistoryRef.current.scroll, key);
    pendingScrollRestoreKeyRef.current = null;
  }, [focusTop, childView, activeId, focus]);

  // A Call box names its delegation by handle_id (== the agent-task id); the
  // child session id comes from the parent's agent-task records. Plain click
  // drills into the CENTER (prototype goCall/setFocus, steerable); shift-click
  // (`peek: true`, the third argument HandoffPart passes) opens the RIGHT
  // panel's read-only peek instead (prototype setStack) — the main transcript
  // stays put.
  const openChildByHandle = useCallback(
    async (handleId: string, agent: string, opts?: { peek?: boolean }) => {
      const parentId = focusTop?.sessionId ?? activeId;
      if (!parentId || !handleId) return;
      try {
        const { tasks } = await fetchSessionAgentTasks(client, parentId);
        const task = tasks.find(
          (t) => t.task_id === handleId || (t as { handle_id?: string }).handle_id === handleId,
        );
        const childId = task?.child_session_id;
        if (!childId) return;
        if (opts?.peek) {
          setRightStack((cur) =>
            openRightEntry(cur, {
              kind: 'agent-peek',
              sessionId: childId,
              agent,
              parentLabel: focusTop?.agent ?? 'main',
            }),
          );
          return;
        }
        // Feature C: one history entry per drill-in, scroll of the view
        // being left captured first.
        navigateCenter({ activeId, focus: pushFocusEntry(focus, { sessionId: childId, agent }) });
      } catch {
        // No resolvable destination — the box simply doesn't navigate; never a
        // silent wrong jump.
      }
    },
    [client, activeId, focus, focusTop?.sessionId, focusTop?.agent, navigateCenter],
  );

  // Opens an artifact in the right panel (prototype artGo → setStack). The
  // record renders immediately from the artifacts route; the provenance chain
  // (lineage route) and the content preview (export route) enrich it as they
  // arrive — each failure leaves its section honestly absent, never a blank
  // panel pretending success.
  const openArtifactById = useCallback(
    async (artifactId: string, opts?: { push?: boolean }) => {
      if (!activeId) return;
      try {
        const result = await fetchSessionArtifacts(client, activeId, { includeChildren: true });
        // The lineage wire's artifact nodes carry no size/created_at/producer;
        // the artifacts listing's versions do — index them ALL by artifact_id
        // so routeFromLineage can thread those real facts onto the graph lines.
        const versionsById = new Map<string, SessionArtifactVersion>();
        let exact: ArtifactRecord | null = null;
        let headFallback: ArtifactRecord | null = null;
        for (const rec of result.artifacts ?? []) {
          for (const v of rec.versions ?? []) versionsById.set(v.artifact_id, v);
          const version = (rec.versions ?? []).find((v) => v.artifact_id === artifactId);
          if (version && !exact) exact = mintArtifactRecord(rec, version);
          if (!headFallback && rec.head_artifact_id === artifactId) {
            const head = headVersion(rec);
            if (head) headFallback = mintArtifactRecord(rec, head);
          }
        }
        const record = exact ?? headFallback;
        if (!record) return;
        setRightStack((cur) => openRightEntry(cur, { kind: 'artifact', record }, opts));
        const patchTop = (patch: Partial<ArtifactRecord>) =>
          setRightStack((cur) => patchTopArtifact(cur, record.id, patch));
        void fetchArtifactLineage(client, record.id, { direction: 'both' })
          .then((graph) =>
            patchTop({ route: routeFromLineage(graph, { viewerSessionId: activeId, versionsById }) }),
          )
          .catch((reason: unknown) => {
            // The chain section states its absence honestly; the WHY still
            // reaches the console as a typed reason (no silent catch).
            console.warn('[detail] artifact lineage unavailable', {
              artifactId: record.id,
              reason: reason instanceof Error ? reason.message : String(reason),
            });
          });
        // The preview flow (detail/preview.ts) follows the bytes route's
        // typed custody_not_cas redirect; a real failure surfaces as a typed
        // console reason while the panel's preview section stays honestly
        // absent — never a silent catch.
        void fetchArtifactPreview(client, {
          id: record.id,
          ...(record.kind ? { kind: record.kind } : {}),
          ...(record.breadcrumb?.[1] ? { name: record.breadcrumb[1] } : {}),
        })
          .then((preview) => patchTop({ preview }))
          .catch((reason: unknown) => {
            console.warn('[detail] artifact preview unavailable', {
              artifactId: record.id,
              reason: reason instanceof Error ? reason.message : String(reason),
            });
          });
      } catch {
        // No record reachable — the chip simply doesn't open; never a blank
        // panel.
      }
    },
    [activeId, client],
  );

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
  // The client-synthesized transcript_activity marker is DELETED (owner
  // capture 2026-08-05: the waiting state printed twice — the wire-driven
  // running wait row already renders '✻ waiting for N background agents…').
  // The transcript renders ONLY what the wire carries.
  const transcriptMessages: Message[] = state.kind === 'loaded' ? state.messages : [];

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
      // The prototype's wsConfirmOpen gate: 'remove workspace' opens a
      // confirmation rather than firing the DELETE straight from the
      // context-menu click (design/prototype/Clio Session.html, ~offset
      // 8104304). The actual delete lives in confirmRemoveWorkspace below.
      setPendingRemoveWorkspaceId(workspaceId);
    },
    [],
  );

  const confirmRemoveWorkspace = useCallback(async (): Promise<void> => {
    const workspaceId = pendingRemoveWorkspaceId;
    if (!workspaceId) return;
    setPendingRemoveWorkspaceId(null);
    setActionError(null);
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
  }, [active?.workspace_id, client, pendingRemoveWorkspaceId]);

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
  // A session with no per-session model runs on the GLOBAL provider binding —
  // the pill shows that effective binding rather than lying "model not set"
  // (owner, 2026-08-05; the wire truth is /v1/providers/lm).
  const sessionModelId =
    detail?.model?.provider_id && detail.model.model_id
      ? `${detail.model.provider_id}/${detail.model.model_id}`
      : undefined;
  const globalModelId =
    globalLm && globalLm.provider && globalLm.model ? `${globalLm.provider}/${globalLm.model}` : undefined;
  // Prefer whichever real value is known, session over global — matches the
  // old fallback order exactly. Never depends on WHICH read produced it,
  // only on whether either one HAS.
  const lastKnownModelId = sessionModelId ?? globalModelId;
  // 'model not set' may only render once BOTH the session-record read AND
  // the global-LM read have genuinely SUCCEEDED and come back empty — a
  // FAILED or still-in-flight read must render unresolved instead, never a
  // fabricated "not set" (round-6 CONCURRENCY finding: this rendered "model
  // not set" while claude_code/cc-sonnet was actually bound, because
  // optionalFetch's null made "failed to read" indistinguishable from
  // "genuinely nothing configured"). Pre-session (no `activeId` at all)
  // keeps the prototype's own immediate default instead of waiting on any
  // read — there is no per-session record to resolve yet, same convention as
  // the composer pill's ctx/asyncCount pre-session defaults elsewhere here.
  const modelUnresolved =
    Boolean(activeId) &&
    lastKnownModelId === undefined &&
    !(detailStatus === 'loaded' && globalLmStatus === 'loaded');
  const modelId = lastKnownModelId ?? '';

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
        // Steering: with a child focused, the composer talks to THAT session
        // (the prototype's child composer), leaving its mode untouched.
        if (focusTop) {
          await client.sendMessage(focusTop.sessionId, { text });
          const result = await client.messages(focusTop.sessionId);
          setChildView((cur) =>
            cur && cur.sessionId === focusTop.sessionId
              ? { ...cur, messages: result.messages ?? [] }
              : cur,
          );
          return;
        }
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
    [activeId, activeScope, client, createAndSelectSession, focusTop, load, refreshPill],
  );

  const queueTurnMode = detail?.mode === 'plan' ? 'plan' : 'execute';

  const onQueueMessage = useCallback((text: string) => {
    setQueue((current) => [
      ...current,
      { id: `mq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, text },
    ]);
  }, []);

  const onReorderQueuedMessage = useCallback((id: string, direction: 'up' | 'down') => {
    setQueue((current) => {
      const index = current.findIndex((item) => item.id === id);
      const swapWith = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || swapWith < 0 || swapWith >= current.length) return current;
      const next = current.slice();
      [next[index], next[swapWith]] = [next[swapWith]!, next[index]!];
      return next;
    });
  }, []);

  const onEditQueuedMessage = useCallback((id: string, text: string) => {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, text } : item)));
  }, []);

  const onRemoveQueuedMessage = useCallback((id: string) => {
    setQueue((current) => current.filter((item) => item.id !== id));
  }, []);

  // mainQNow/fv.deliverNow: interrupt the current step (a real backend call,
  // POST /v1/sessions/{id}/cancel) and deliver the whole held queue right
  // away, oldest first, instead of waiting for the next step boundary.
  const onDeliverQueuedNow = useCallback(() => {
    if (!activeId || queue.length === 0) return;
    const items = queue;
    setQueue([]);
    void (async () => {
      try {
        await client.cancelSession(activeId);
      } catch {
        // The run may already have finished on its own — delivering the held
        // messages is still the right outcome either way.
      }
      for (const item of items) {
        await send(item.text, queueTurnMode);
      }
    })();
  }, [activeId, client, queue, queueTurnMode, send]);

  // The composer's stop control (owner request 2026-08-05): the same real
  // cancel call `onDeliverQueuedNow` already uses, but targeting whatever
  // session the composer is CURRENTLY talking to — the focused child while
  // one is drilled into (send() steers there too), else the active session.
  const onStop = useCallback(() => {
    const targetId = focusTop?.sessionId ?? activeId;
    if (!targetId) return;
    void client.cancelSession(targetId).catch(() => {
      // Best-effort: the turn may already have finished server-side by the
      // time this reaches the backend.
    });
  }, [activeId, client, focusTop]);

  // Deliver the next held message as soon as this client's own send
  // round-trip clears — "delivered as soon as main resumes", the prototype's
  // own hint for the common case where the agent finishes before the user
  // queues a second message.
  useEffect(() => {
    if (sending) return;
    setQueue((current) => {
      if (current.length === 0) return current;
      const [next, ...rest] = current;
      void send(next!.text, queueTurnMode);
      return rest;
    });
  }, [sending, send, queueTurnMode]);

  // Live SSE rows merge INTO chronological position (and dedupe against the
  // seeded trace, which publishes the same semantic payloads) — plain
  // concatenation used to render two unsorted segments (gact-tui#356).
  const observabilityData = obs
    ? { ...obs, timeline: mergeTimelineRows(obs.timeline ?? [], liveTraceRows) }
    : null;
  const filesWorkspaceId = filesWorkspaceRequest ?? activeWorkspaceId ?? workspaces[0]?.id;
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
  // Thin projection of the pill's raw agent-task rows for the async chip's
  // runs popover — undefined (not []) until a real read has landed, so the
  // composer falls back to its plain onOpenAsync jump instead of opening an
  // empty popover that misrepresents "we don't know yet" as "there is none".
  const composerAsyncTasks: AsyncRunItem[] | undefined = activePill?.asyncTasks?.map((task) => {
    const id = task.task_id ?? task.id ?? '';
    const status = String(task.status ?? '').toLowerCase();
    const placement = task.placement ?? task.host;
    return {
      id,
      label: task.run_label || task.agent_ref?.expert_id || id || 'task',
      status,
      ...(placement ? { placement } : {}),
      // Real created_at/completed_at|updated_at wire fields drive the
      // popover's "2h 14m" / "done 26m ago" elapsed text — never invented.
      ...(task.created_at ? { startedAt: task.created_at } : {}),
      ...(task.completed_at ?? task.updated_at
        ? { endedAt: task.completed_at ?? task.updated_at }
        : {}),
      terminal: TERMINAL_AGENT_TASK_STATUSES.has(status),
    };
  });
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
  // running: the ACTIVE session's turn is actually in flight on the
  // backend — NOT the same thing as `sending`, which only covers this
  // client's own POST round-trip (the server accepts and streams the rest
  // over SSE, see session_messages_client.ts). The message-events effect
  // above keeps `state.messages` current on every lifecycle event
  // regardless of which panel is open (the trace-events effect that reads
  // session.status_changed only runs for the obs panel), so the trailing
  // assistant message's settledness is the freshest live signal available
  // here; the `sessions` row status is the fallback for the gap before that
  // message exists yet.
  const activeMessages = state.kind === 'loaded' ? state.messages : NO_MESSAGES;
  const latestActiveAssistant = latestAssistantMessage(activeMessages);
  const activeSessionRow = sessions.find((row) => row.id === activeId);
  const activeRunning =
    sending ||
    (latestActiveAssistant
      ? !(latestActiveAssistant.stop_reason || latestActiveAssistant.error_info)
      : toStatus(activeSessionRow?.status) === 'running');
  // The composer keeps talking to a focused child (see `send` above), so
  // once that child settles the composer that reaches it is a "reawaken"
  // action, not a plain send — the prototype states that plainly rather
  // than leaving the generic main-session placeholder in place (final-sxs
  // ledger #5). `childView.status` is the same live status ChildFocusView's
  // own footer reads; an empty string (not yet loaded) never counts as
  // settled.
  const focusedChildStatus =
    focusTop && childView && childView.sessionId === focusTop.sessionId ? childView.status : '';
  const focusedChildSettled = Boolean(focusedChildStatus && focusedChildStatus !== 'running');
  const composerElement =
    state.kind !== 'missing' ? (
      <Composer
        // A session can carry no model, and clio-agent exposes no endpoint
        // for the model that would ACTUALLY answer the turn (/v1/models and
        // /v1/system both 404). Say so rather than render a bare chevron —
        // unless the reads behind that claim haven't actually resolved yet,
        // in which case `modelUnresolved` below renders an honest dash
        // instead of an asserted fact (round-6 CONCURRENCY finding).
        models={modelId ? modelOptions : [{ id: '', label: 'model not set' }, ...modelOptions]}
        modelId={modelId}
        {...(modelUnresolved ? { modelUnresolved: true } : {})}
        modelProviders={modelProviders}
        {...(thinkingLevel ? { thinkingLevel } : {})}
        sessionMode={detail?.mode === 'plan' ? 'plan' : 'execute'}
        commands={commands}
        files={files}
        placement={placement}
        {...(focusedChildSettled && focusTop
          ? { placeholder: `Message ${focusTop.agent} to reawaken it` }
          : {})}
        {...(activePill?.asyncCount !== undefined ? { asyncCount: activePill.asyncCount } : {})}
        {...(composerAsyncTasks ? { asyncTasks: composerAsyncTasks } : {})}
        {...(composerContextPercent !== undefined ? { contextPercent: composerContextPercent } : {})}
        {...(detail?.approval_mode ? { approvalMode: detail.approval_mode } : {})}
        onApprovalModeChange={(next) => void setApprovalMode(next)}
        onModelChange={(next) => void setModel(next)}
        onOpenProviderSettings={() => {
          setSettingsSection(undefined);
          setPanel('settings');
        }}
        onOpenPlacement={() => {
          // Matches the topbar's plain "files" toggle: THIS session's
          // workspace, not a stale rail/search request for a different one.
          setFilesWorkspaceRequest(undefined);
          setPanel('files');
        }}
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
        running={activeRunning}
        onStop={onStop}
        queuedMessages={queue}
        onQueueMessage={onQueueMessage}
        onReorderQueuedMessage={onReorderQueuedMessage}
        onEditQueuedMessage={onEditQueuedMessage}
        onRemoveQueuedMessage={onRemoveQueuedMessage}
        onDeliverQueuedNow={onDeliverQueuedNow}
        {...(starterPrompt ? { insertPrompt: starterPrompt } : {})}
        {...(composerFooter ? { footer: composerFooter } : {})}
      />
    ) : null;

  // The right slot renders whatever entry is on top of the stack: an
  // artifact detail record, or the shift-click agent peek.
  const rightTop = rightStack.length > 0 ? rightStack[rightStack.length - 1]! : null;

  const pendingRemoveWorkspace =
    pendingRemoveWorkspaceId === null
      ? null
      : {
          id: pendingRemoveWorkspaceId,
          name:
            renamedWorkspaces[pendingRemoveWorkspaceId] ??
            workspaceDisplayLabel(pendingRemoveWorkspaceId, workspaces),
          sessionCount: sessions.filter((s) => s.workspace_id === pendingRemoveWorkspaceId).length,
        };

  return (
    <RailActionsProvider
      onNewSession={openNewDialog}
      onSessionAction={handleSessionAction}
      onWorkspaceAction={handleWorkspaceAction}
      onRenameWorkspace={(workspaceId, next) => void renameWorkspace(workspaceId, next)}
      onOpenWorkspaceFiles={(workspaceId) => {
        setFilesWorkspaceRequest(workspaceId);
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
        ribbon={[
          { id: 'main', label: 'main' },
          ...focus.map((entry) => ({ id: entry.sessionId, label: entry.agent })),
        ]}
        activeRibbonId={focusTop?.sessionId ?? activeScope}
        onSelectRibbon={(tabId: string) => {
          if (tabId === 'main') {
            // Feature C: the 'main' crumb is itself a history entry now —
            // Back from it returns to wherever the click came from.
            navigateCenter({ activeId, focus: [] });
            setActiveScope('main');
            return;
          }
          const at = focus.findIndex((entry) => entry.sessionId === tabId);
          if (at >= 0) navigateCenter({ activeId, focus: truncateFocusAt(focus, at) });
          else setActiveScope(tabId);
        }}
        onRenameSession={(sessionId, next) => void rename(sessionId, next)}
        {...(rightTop
          ? {
              detail:
                rightTop.kind === 'agent-peek' ? (
                  <AgentPeekView
                    client={client}
                    sessionId={rightTop.sessionId}
                    agent={rightTop.agent}
                    parentLabel={rightTop.parentLabel}
                    onClose={() => setRightStack([])}
                  />
                ) : (
                  <DetailSlot
                    record={{
                      ...rightTop.record,
                      breadcrumb: ['session', ...rightStack.map(rightEntryLabel)],
                    }}
                    client={client}
                    onOpenStorage={({ workspaceId }) => {
                      // The prototype's artLoc: the storage row opens the
                      // workspace files layer, scoped to the workspace that
                      // custodies the artifact's bytes when the record names
                      // one (else the active session's own workspace wins).
                      if (workspaceId) setFilesWorkspaceRequest(workspaceId);
                      setPanel('files');
                    }}
                    onOpenSession={(sessionId) => {
                      // The provenance graph's cross-session jump (foreign
                      // cluster header / activity line): navigate the CENTER
                      // to that session — the same channel as the obs layer's
                      // agent navigation (handleObsNavigate 'agent').
                      setPanel(null);
                      setActiveId(sessionId);
                    }}
                    onOpenArtifact={(artifactId) => void openArtifactById(artifactId, { push: true })}
                    onClose={() => setRightStack([])}
                  />
                ),
            }
          : {})}
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
        onOpenSettings={(section) => {
          setSettingsSection(section);
          setPanel('settings');
        }}
        onOpenSearch={() => setSearchOpen(true)}
        newDialogOpen={newOpen}
        {...(relayStatus ? { relayStatus } : {})}
        onTogglePanel={(next) => {
          // 'artifacts'/'ctx' deep-link into the SAME observability layer on a
          // specific tab (proto tgArtifacts/tgTelemetry: unlike the eye icon,
          // neither ever CLOSES the layer — they only open it / switch tabs).
          if (next === 'artifacts' || next === 'context') {
            setPanel('obs');
            setObsTab(next === 'artifacts' ? 'artifacts' : 'context');
            return;
          }
          if (next === 'files') {
            // The topbar's plain "files" toggle always means THIS session's
            // workspace — clear any workspace the rail/search asked for
            // explicitly, or a stale request would keep winning here.
            setFilesWorkspaceRequest(undefined);
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
            {focusTop && childView?.sessionId === focusTop.sessionId ? (
              <ChildFocusView
                agent={focusTop.agent}
                parentLabel={focus.length > 1 ? focus[focus.length - 2]!.agent : 'main'}
                messages={childView.messages}
                status={childView.status}
                {...(childView.createdAt ? { createdAt: childView.createdAt } : {})}
                {...(childView.updatedAt ? { updatedAt: childView.updatedAt } : {})}
                onOpenChild={openChildByHandle}
                onOpenArtifact={(artifactId) => void openArtifactById(artifactId)}
                scrollContainerRef={visibleTranscriptScrollRef}
                // Feature C's on-screen back affordance — one level up,
                // the same transition the breadcrumb crumb just before
                // this one performs.
                onBack={() =>
                  navigateCenter({ activeId, focus: truncateFocusAt(focus, focus.length - 2) })
                }
              />
            ) : state.kind === 'loaded' && transcriptMessages.length > 0 ? (
              <Transcript
                messages={transcriptMessages}
                onOpenChild={openChildByHandle}
                onOpenArtifact={(artifactId) => void openArtifactById(artifactId)}
                childPreviews={childPreviews}
                scrollContainerRef={setMainTranscriptRef}
              />
            ) : null}
            {focusedChildSettled && focusTop ? (
              // The visible card sits in its own 36px gutter wrapper — the
              // SAME box formula composer.css uses for the composer frame
              // below it — so the two share one left/right edge rather than
              // the notice sticking out wider (or narrower) than what it's
              // explaining.
              <div className="sessionview__reawakenwrap">
                <p className="sessionview__reawaken" data-testid="reawaken-notice" role="note">
                  <span className="sessionview__reawaken-mark" aria-hidden="true">
                    !
                  </span>
                  This agent finished and returned to main. Sending a message reawakens it with
                  its full context.
                </p>
              </div>
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
            {...(settingsSection ? { initialSection: settingsSection } : {})}
            {...(connections ? { connections } : {})}
            {...(activeConnectionId ? { activeConnectionId } : {})}
            {...(activePill?.contextPercent !== undefined
              ? { contextPercent: activePill.contextPercent }
              : {})}
            {...(activePill?.contextTokens !== undefined
              ? { contextTokens: activePill.contextTokens }
              : {})}
            {...(activePill?.contextLimit !== undefined
              ? { contextLimit: activePill.contextLimit }
              : {})}
            {...(activePill?.artifactCount !== undefined
              ? { artifactCount: activePill.artifactCount }
              : {})}
            {...(activeId ? { toolCallCount: sessionToolCallCount } : {})}
            {...(activePill?.asyncTasks ? { asyncTasks: activePill.asyncTasks } : {})}
            {...(detail?.approval_mode ? { approvalMode: detail.approval_mode } : {})}
            onApprovalModeChange={(next) => void setApprovalMode(next)}
            {...(activeBlueprintId ? { activeBlueprintId } : {})}
            onOpenObservability={() => setPanel('obs')}
          />
        </Layer>

        <Layer
          open={panel === 'obs'}
          title="observability"
          headerIcon={<Icon name="eye" size={14} />}
          headerMeta={<ObservabilityTrace />}
          // Explicit width/height (the prototype's own 679x640) give the
          // window variant a FIXED initial size — Layer.tsx sets
          // `maxHeight: 'none'` once a height is supplied, which is what
          // stops the panel auto-growing/shrinking to each tab's content
          // height (final-sxs ledger #8: switching tabs "jumped" the whole
          // modal). Still resizable afterward via the drag grip, same as
          // FilesLayer's own width={680}/height precedent.
          width={679}
          height={640}
          windowControls
          onClose={() => setPanel(null)}
        >
          {observabilityData ? (
            <Observability
              key={obsTab ?? 'default'}
              data={observabilityData}
              showTraceHeader={false}
              onNavigate={handleObsNavigate}
              onOpenArtifact={(artifactId) => void openArtifactById(artifactId)}
              onRetryTrace={retryObsTrace}
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
          onClose={() => {
            setPanel(null);
            setFilesWorkspaceRequest(undefined);
          }}
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
          onChooseWorkspace={(workspaceId) => {
            setFilesWorkspaceRequest(workspaceId);
            setPanel('files');
          }}
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
        <RemoveWorkspaceConfirm
          workspace={pendingRemoveWorkspace}
          onCancel={() => setPendingRemoveWorkspaceId(null)}
          onConfirm={() => void confirmRemoveWorkspace()}
        />
      </AppShell>
    </RailActionsProvider>
  );
}

/** Group sessions by workspace, preserving backend order within each group. */
export function groupByWorkspace(
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
    // A session spawned by another session is that parent's child agent —
    // it renders inside the parent's transcript (Call boxes), never as a
    // top-level rail row of its own.
    if (session.parent_session_id) continue;
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

/** The trailing assistant message, if any — read backwards since it is
 *  always the last few entries, never the whole transcript. */
function latestAssistantMessage(messages: Message[]): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant') return message;
  }
  return undefined;
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
