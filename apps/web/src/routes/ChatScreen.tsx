import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import type {
  FileDiff,
  Message,
  PermissionRequest,
  PermissionScope,
  ProviderDef,
  SlashCommandDef,
} from '@clio/core';
import type { ModelOption, PermissionMode } from '../components/Composer.js';
import type { BackendHandle } from '../App.js';
import { fixturesForDemo } from '../fixtures/demo.js';
import { createLiveSessions, createLiveTranscript } from '../live.js';

import { BackendPicker } from '../components/BackendPicker.js';
import { Composer } from '../components/Composer.js';
import { DiffPane } from '../components/DiffPane.js';
import { Icon } from '../components/Icon.js';
import { InspectorDrawer, summarizeToolCalls } from '../components/InspectorDrawer.js';
import { LeftRail, type RailRoute } from '../components/LeftRail.js';
import { PermissionCard } from '../components/PermissionCard.js';
import {
  SessionsColumn,
  type SessionRow,
  type WorkspaceOption,
} from '../components/SessionsColumn.js';
import {
  DEFAULT_COMMANDS,
  SlashPalette,
  type SlashCommand,
} from '../components/SlashPalette.js';

const DEFAULT_COMMAND_IDS = new Set(DEFAULT_COMMANDS.map((c) => c.id));
import { Transcript, type TranscriptDensity } from '../components/Transcript.js';
import {
  AgentsPage,
  DoctorPage,
  McpPage,
  MemoryPage,
  MetricsPage,
  ToolsPage,
  WorkspacesPage,
} from './discovery/index.js';
import { Client } from '@clio/core';
import { inTauri, tauriFetch } from '../tauri.js';
import { useToast } from '../components/Toast.js';
import {
  createPersistedBoolean,
  createPersistedSignal,
  createPersistedString,
} from '../persisted.js';
import './chat.css';

export interface ChatScreenProps {
  backend: BackendHandle;
  onOpenSettings?: () => void;
  onAddRemote?: () => void;
}

export function ChatScreen(props: ChatScreenProps) {
  const url = new URL(window.location.href);
  const fixtureName = url.searchParams.get('fixture');

  if (fixtureName) {
    return (
      <FixtureDriven
        backend={props.backend}
        fixture={fixtureName}
        onOpenSettings={props.onOpenSettings}
        onAddRemote={props.onAddRemote}
      />
    );
  }
  return (
    <LiveDriven
      backend={props.backend}
      onOpenSettings={props.onOpenSettings}
      onAddRemote={props.onAddRemote}
    />
  );
}

/* -------------------------- FixtureDriven -------------------------- */

function FixtureDriven(props: {
  backend: BackendHandle;
  fixture: string;
  onOpenSettings?: () => void;
  onAddRemote?: () => void;
}) {
  const fixtures = fixturesForDemo();
  const isEmpty = props.fixture === 'empty-sidebar';
  const rows: SessionRow[] = isEmpty
    ? []
    : fixtures.sessions.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        workspace: s.project,
        updatedAt: s.updatedAt,
        preview: previewFromFixture(props.fixture, fixtures, s.id),
        model: s.id === 's1' ? 'opus-4.7' : undefined,
      }));
  const initialMessages = isEmpty
    ? []
    : (fixtures.byName[props.fixture] ?? fixtures.byName.normal!);

  const [sessions] = createSignal<SessionRow[]>(rows);
  const [activeId, setActiveId] = createSignal<string>(rows[0]?.id ?? '');
  const [density, setDensity] = createSignal<TranscriptDensity>('normal');
  if (props.fixture === 'verbose') setDensity('verbose');
  if (props.fixture === 'summary') setDensity('summary');

  const [messages] = createSignal(initialMessages);
  const pendingPermission = (): PermissionRequest | null =>
    props.fixture === 'permission' ? fixtures.permission : null;

  const url = new URL(window.location.href);
  const openHint = url.searchParams.get('open');
  const streaming = props.fixture === 'streaming-busy';

  return (
    <ChatLayout
      backendUrl={props.backend.url}
      sessions={sessions()}
      activeId={activeId()}
      onSelect={setActiveId}
      density={density()}
      setDensity={setDensity}
      messages={messages()}
      pendingPermission={pendingPermission()}
      composerDisabled={!activeId()}
      streaming={streaming}
      preOpen={openHint}
      onOpenSettings={props.onOpenSettings}
      onAddRemote={props.onAddRemote}
      caps={props.backend.capabilities}
    />
  );
}

function previewFromFixture(
  fix: string,
  fixtures: ReturnType<typeof fixturesForDemo>,
  sid: string,
): string | undefined {
  const ms = fixtures.byName[fix] ?? fixtures.byName.normal;
  if (!ms || sid !== (ms[ms.length - 1]?.id?.startsWith('m') ? 's1' : sid)) return undefined;
  const last = ms[ms.length - 1];
  const textPart = last?.parts.find((p) => p.type === 'text');
  if (textPart && textPart.type === 'text') return textPart.text;
  return undefined;
}

/* -------------------------- LiveDriven ----------------------------- */

function LiveDriven(props: {
  backend: BackendHandle;
  onOpenSettings?: () => void;
  onAddRemote?: () => void;
}) {
  const live = createLiveSessions({
    url: props.backend.url,
    bearerToken: props.backend.bearerToken,
  });

  const rows = createMemo<SessionRow[]>(() => {
    const s = live.sessions() ?? [];
    return s.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      workspace: row.project,
      updatedAt: row.updatedAt,
    }));
  });

  const [activeId, setActiveId] = createSignal<string>('');
  createEffect(() => {
    const list = rows();
    if (!activeId() && list.length > 0) setActiveId(list[0]!.id);
  });

  const [density, setDensity] = createPersistedSignal<TranscriptDensity>(
    'clio.density.v1',
    'normal',
    {
      parse: (s) =>
        s === 'verbose' || s === 'summary' ? (s as TranscriptDensity) : 'normal',
      stringify: (v) => v,
    },
  );
  const [streaming, setStreaming] = createSignal(false);
  const toast = useToast();

  const transcript = createLiveTranscript(live.client, activeId, {
    patch: live.patch,
    setRaw: live.setRaw,
  });

  createMemo(() => {
    const cur = rows().find((r) => r.id === activeId());
    setStreaming(cur?.status === 'running');
  });

  // SSE state-change toasts so the user notices reconnects + errors.
  let lastSseStatus: typeof transcript.status extends () => infer R ? R : never = 'closed';
  createEffect(() => {
    const s = transcript.status();
    if (s === lastSseStatus) return;
    if (s === 'error' && lastSseStatus !== 'error') {
      toast.push({
        tone: 'error',
        title: 'SSE disconnected',
        body: 'Lost the stream from the backend; reconnect on next message.',
        duration: 5000,
      });
    }
    if (s === 'open' && lastSseStatus === 'error') {
      toast.push({
        tone: 'success',
        title: 'SSE reconnected',
        duration: 2500,
      });
    }
    lastSseStatus = s;
  });

  // Surface a completed turn so users notice when CLIO finishes.
  let lastCompletionId: string | undefined;
  createEffect(() => {
    const c = transcript.lastCompletion();
    if (!c || c.message_id === lastCompletionId) return;
    lastCompletionId = c.message_id;
    const tone = c.stop_reason === 'error' ? 'error' : 'success';
    toast.push({
      tone,
      title: c.stop_reason === 'error' ? 'Turn ended in error' : 'CLIO responded',
      body:
        c.stop_reason === 'error'
          ? 'See the message error pill for detail.'
          : `${c.tokens?.total ?? (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0)} tokens · $${(c.cost_usd ?? 0).toFixed(4)}`,
      duration: 3500,
    });
  });

  async function sendUserMessage(text: string) {
    let sessionId = activeId();
    if (!sessionId) {
      const created = await live.client.createSession({ title: text.slice(0, 60) });
      sessionId = created.id;
      live.refetch();
      setActiveId(sessionId);
    }
    await live.client.sendMessage(sessionId, { text });
  }

  async function decidePermission(
    decision: 'approve' | 'deny',
    scope?: PermissionScope,
  ) {
    const p = transcript.pendingPermission();
    if (!p) return;
    try {
      await live.client.resolvePermission(p.id, decision, scope);
    } catch (e) {
      console.error('resolvePermission failed', e);
    }
  }

  async function stopRun() {
    const id = activeId();
    if (!id) return;
    try {
      await live.client.cancelSession(id);
    } catch (e) {
      console.error('cancelSession failed', e);
    }
  }

  async function newEmptySession() {
    const created = await live.client.createSession({ title: 'New session' });
    live.refetch();
    setActiveId(created.id);
  }

  async function renameSession(id: string, nextTitle: string) {
    try {
      await live.client.patchSession(id, { title: nextTitle });
      live.patch(id, { title: nextTitle });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Rename failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function deleteSession(id: string) {
    try {
      await live.client.deleteSession(id);
      live.setRaw((prev) => prev.filter((r) => r.id !== id));
      if (activeId() === id) setActiveId('');
      toast.push({ tone: 'success', title: 'Session deleted', duration: 2200 });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Delete failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function exportSession(id: string) {
    try {
      const payload = await live.client.exportSession(id);
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clio-session-${id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.push({
        tone: 'success',
        title: 'Session exported',
        body: `clio-session-${id}.json`,
        duration: 3000,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Export failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function shareSession(id: string) {
    try {
      const { token, url: shareUrl } = await live.client.shareSession(id);
      const link =
        shareUrl ?? `${new URL(props.backend.url).origin}/v1/shared/${token}`;
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(link).catch(() => undefined);
      }
      toast.push({
        tone: 'success',
        title: 'Share link copied',
        body: link,
        duration: 5000,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Share failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function forkSession(id: string) {
    try {
      const original = rows().find((r) => r.id === id);
      const created = await live.client.forkSession(id, {
        title: original ? `Fork of ${original.title}` : 'Forked session',
      });
      live.refetch();
      setActiveId(created.id);
      toast.push({
        tone: 'success',
        title: 'Session forked',
        body: `New session: ${created.title}`,
        duration: 3000,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Fork failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Live workspaces (powers the SessionsColumn workspace switcher).
  const [workspacesData] = createResource(() => live.client.workspaces());
  const workspaces = createMemo(() => {
    const ws = workspacesData()?.workspaces ?? [];
    return ws.map((w) => ({ id: w.id, name: w.name, rootPath: w.root_path }));
  });
  const [selectedWorkspaceId, setSelectedWorkspaceId] = createPersistedString(
    'clio.selected-workspace.v1',
    '__all',
  );
  const filteredRows = createMemo(() => {
    const ws = selectedWorkspaceId();
    if (ws === '__all') return rows();
    return rows().filter((r) => r.workspace === ws || r.workspace === undefined);
  });

  // Live providers (powers the composer model picker).
  const [providersData] = createResource(() => live.client.providers());
  const models = createMemo<ModelOption[]>(() => {
    const ps = providersData()?.providers ?? [];
    return providersToModels(ps);
  });
  const [selectedModelId, setSelectedModelId] = createSignal<string>('');
  // Auto-select the first provider's default model.
  createEffect(() => {
    if (selectedModelId()) return;
    const first = models()[0];
    if (first) setSelectedModelId(first.id);
  });

  async function pickModel(m: ModelOption) {
    setSelectedModelId(m.id);
    const id = activeId();
    if (!id) return;
    try {
      await live.client.patchSession(id, {
        model: { provider_id: m.providerId, model_id: m.modelId },
      });
    } catch (e) {
      console.error('patchSession(model) failed', e);
    }
  }

  const [permMode, setPermMode] = createSignal<PermissionMode>('ask');
  async function pickPermMode(p: PermissionMode) {
    setPermMode(p);
    const id = activeId();
    if (!id) return;
    try {
      await live.client.patchSession(id, { agent: { mode: p } });
    } catch (e) {
      console.error('patchSession(agent.mode) failed', e);
    }
  }

  // Live slash commands (powers Cmd+K palette dynamic list).
  const [commandsData] = createResource(() => live.client.commands());
  const slashCommands = createMemo<SlashCommandDef[]>(
    () => commandsData()?.commands ?? [],
  );

  function copyMessageToClipboard(msg: Message) {
    const text = messageToText(msg);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
  }

  async function regenerateMessage(msg: Message) {
    const id = activeId();
    if (!id) return;
    // Find the user message immediately before msg, re-send its text.
    const msgs = transcript.messages();
    const idx = msgs.findIndex((m) => m.id === msg.id);
    for (let i = idx - 1; i >= 0; i--) {
      const candidate = msgs[i];
      if (candidate?.role !== 'user') continue;
      const textPart = candidate.parts.find((p) => p.type === 'text');
      if (textPart && textPart.type === 'text' && textPart.text) {
        await live.client.sendMessage(id, { text: textPart.text });
        return;
      }
    }
  }

  function editMessage(msg: Message) {
    // For v0.9.1 we surface the text in the composer (via a custom event
    // — wiring the actual edit into the transcript is a follow-up). The
    // user can re-send the modified text via Enter.
    const textPart = msg.parts.find((p) => p.type === 'text');
    const text = textPart && textPart.type === 'text' ? textPart.text : '';
    const ta = document.querySelector(
      '[data-testid="composer-input"]',
    ) as HTMLTextAreaElement | null;
    if (ta && text) {
      ta.value = text;
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  return (
    <ChatLayout
      backendUrl={props.backend.url}
      sessions={filteredRows()}
      activeId={activeId()}
      workspaces={workspaces()}
      selectedWorkspaceId={selectedWorkspaceId()}
      onPickWorkspace={setSelectedWorkspaceId}
      onSelect={setActiveId}
      density={density()}
      setDensity={setDensity}
      messages={transcript.messages()}
      pendingPermission={transcript.pendingPermission()}
      onSubmit={sendUserMessage}
      onPermissionDecide={decidePermission}
      onStop={stopRun}
      onNewSession={newEmptySession}
      onRenameSession={renameSession}
      onDeleteSession={deleteSession}
      onExportSession={exportSession}
      onShareSession={shareSession}
      onForkSession={forkSession}
      models={models()}
      selectedModelId={selectedModelId()}
      onPickModel={pickModel}
      permMode={permMode()}
      onPickPermMode={pickPermMode}
      slashCommands={slashCommands()}
      onCopyMessage={copyMessageToClipboard}
      onRegenerate={regenerateMessage}
      onEditMessage={editMessage}
      composerDisabled={false}
      streaming={streaming()}
      sseStatus={transcript.status()}
      sessionCostUsd={transcript.costUsd()}
      lastStopReason={transcript.lastCompletion()?.stop_reason}
      onOpenSettings={props.onOpenSettings}
      onAddRemote={props.onAddRemote}
      caps={props.backend.capabilities}
    />
  );
}

/* -------------------------- ChatLayout ----------------------------- */

interface ChatLayoutProps {
  backendUrl: string;
  sessions: SessionRow[];
  activeId: string;
  onSelect: (id: string) => void;
  density: TranscriptDensity;
  setDensity: (d: TranscriptDensity) => void;
  messages: Message[];
  pendingPermission: PermissionRequest | null;
  onSubmit?: (text: string) => Promise<void> | void;
  onPermissionDecide?: (decision: 'approve' | 'deny', scope?: PermissionScope) => void;
  onStop?: () => void | Promise<void>;
  composerDisabled: boolean;
  streaming?: boolean;
  sseStatus?: 'connecting' | 'open' | 'closed' | 'error';
  preOpen?: string | null;
  sessionCostUsd?: number;
  lastStopReason?: string;
  onNewSession?: () => void | Promise<void>;
  onOpenSettings?: () => void;
  onAddRemote?: () => void;
  caps?: BackendHandle['capabilities'];
  /** SessionsColumn workspace switcher wiring (LiveDriven path only). */
  workspaces?: WorkspaceOption[];
  selectedWorkspaceId?: string;
  onPickWorkspace?: (id: string) => void;
  /** Per-session actions (LiveDriven path only). */
  onRenameSession?: (id: string, nextTitle: string) => void | Promise<void>;
  onDeleteSession?: (id: string) => void | Promise<void>;
  onExportSession?: (id: string) => void | Promise<void>;
  onShareSession?: (id: string) => void | Promise<void>;
  onForkSession?: (id: string) => void | Promise<void>;
  /** Composer wiring (LiveDriven path only). */
  models?: ModelOption[];
  selectedModelId?: string;
  onPickModel?: (m: ModelOption) => void | Promise<void>;
  permMode?: PermissionMode;
  onPickPermMode?: (m: PermissionMode) => void | Promise<void>;
  slashCommands?: SlashCommandDef[];
  /** Message-level actions. */
  onCopyMessage?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onEditMessage?: (msg: Message) => void;
}

function messageToText(msg: Message): string {
  return msg.parts
    .map((p) => {
      if (p.type === 'text') return p.text;
      if (p.type === 'thinking') return p.thinking ?? p.text ?? '';
      if (p.type === 'tool_call')
        return `[tool] ${p.tool_name}(${JSON.stringify(p.input ?? {})})`;
      if (p.type === 'tool_result')
        return typeof p.output === 'string'
          ? p.output
          : '[tool_result]';
      if (p.type === 'file_diff') return `[diff] ${p.path}`;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function providersToModels(ps: ProviderDef[]): ModelOption[] {
  const out: ModelOption[] = [];
  for (const p of ps) {
    const candidates = collectModelIds(p);
    for (const m of candidates) {
      out.push({
        id: `${p.id}:${m}`,
        providerId: p.id,
        modelId: m,
        providerLabel: p.name,
        description: m === p.default_model ? 'provider default' : undefined,
      });
    }
  }
  return out;
}

function collectModelIds(p: ProviderDef): string[] {
  const ms = new Set<string>();
  if (p.default_model) ms.add(p.default_model);
  const meta = p.metadata ?? {};
  for (const key of ['models', 'available_models']) {
    const v = (meta as Record<string, unknown>)[key];
    if (Array.isArray(v)) {
      for (const m of v) if (typeof m === 'string') ms.add(m);
    }
  }
  return Array.from(ms);
}

function ChatLayout(props: ChatLayoutProps) {
  const [activeDiff, setActiveDiff] = createSignal<FileDiff | null>(null);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [paletteQuery, setPaletteQuery] = createSignal('');
  const [inspectorOpen, setInspectorOpen] = createPersistedBoolean(
    'clio.inspector-open.v1',
    true,
  );
  const [railRoute, setRailRoute] = createSignal<RailRoute>('sessions');
  const [selectedMessageId, setSelectedMessageId] = createSignal<string>('');

  // Shared Client for the discovery pages — same backend, routed
  // through gact_http inside Tauri to dodge CORS.
  const discoveryClient = new Client({
    baseUrl: props.backendUrl,
    fetch: inTauri() ? tauriFetch : undefined,
  });

  onMount(() => {
    if (props.preOpen === 'diff') {
      const firstDiff = firstFileDiff(props.messages);
      if (firstDiff) setActiveDiff(firstDiff);
    } else if (props.preOpen === 'palette') {
      setPaletteOpen(true);
    } else if (props.preOpen === 'inspector') {
      setInspectorOpen(true);
    } else if (props.preOpen === 'no-inspector') {
      setInspectorOpen(false);
    }
  });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        cycleDensity(props.density, props.setDensity);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void props.onNewSession?.();
        return;
      }
      if (e.key === 'Escape' && paletteOpen()) {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    onCleanup(() => window.removeEventListener('keydown', onKey, true));
  });

  function handlePick(cmd: SlashCommand) {
    setPaletteOpen(false);
    // First check for /v1/commands rooted by trigger or id — these
    // are backend-defined and we pass them through as a session
    // message so the backend resolves the action itself.
    const isBackendRoute = !DEFAULT_COMMAND_IDS.has(cmd.id);
    if (isBackendRoute) {
      // Send the command as a message; the backend's commands service
      // resolves it (e.g. /clear drops the session log).
      void props.onSubmit?.(cmd.trigger);
      return;
    }
    // Built-in palette commands route to UI affordances.
    switch (cmd.trigger) {
      case '/settings':
        props.onOpenSettings?.();
        return;
      case '/sessions':
        setRailRoute('sessions');
        return;
      case '/agents':
        setRailRoute('agents');
        return;
      case '/tools':
        setRailRoute('tools');
        return;
      case '/doctor':
        setRailRoute('doctor');
        return;
      case '/clear': {
        const pane = document.querySelector('.chat__pane');
        pane?.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
        return;
      }
      case '/help':
      default:
        return;
    }
  }

  const activeRow = () => props.sessions.find((s) => s.id === props.activeId);
  const latestAssistant = createMemo<Message | null>(() => {
    for (let i = props.messages.length - 1; i >= 0; i--) {
      const m = props.messages[i];
      if (m && m.role === 'assistant') return m;
    }
    return null;
  });

  const inspectorTarget = createMemo<Message | null>(() => {
    const sid = selectedMessageId();
    if (sid) {
      const m = props.messages.find((x) => x.id === sid);
      if (m) return m;
    }
    return latestAssistant();
  });

  const toolCallsForInspector = createMemo(() => {
    const m = inspectorTarget();
    if (!m) return [];
    return summarizeToolCalls(m.parts);
  });

  function connectionTone(): 'ok' | 'warn' | 'err' | 'idle' {
    switch (props.sseStatus) {
      case 'open':
        return 'ok';
      case 'connecting':
        return 'warn';
      case 'error':
        return 'err';
      case 'closed':
      default:
        return 'idle';
    }
  }

  const capsFlags = () => props.caps?.capabilities ?? {};

  const onChat = () => railRoute() === 'sessions';

  return (
    <div
      class={'chat ' + (onChat() ? '' : 'chat--discovery')}
      data-testid="chat-screen"
    >
      <LeftRail
        active={railRoute()}
        caps={capsFlags()}
        onSelect={(id) => {
          if (id === 'settings') {
            props.onOpenSettings?.();
            return;
          }
          setRailRoute(id);
        }}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <Show when={onChat()}>
        <SessionsColumn
          rows={props.sessions}
          activeId={props.activeId}
          onSelect={props.onSelect}
          onNewSession={props.onNewSession}
          connectionLabel={props.sseStatus ?? 'idle'}
          connectionTone={connectionTone()}
          workspaces={props.workspaces}
          selectedWorkspaceId={props.selectedWorkspaceId}
          onPickWorkspace={props.onPickWorkspace}
          onRenameSession={props.onRenameSession}
          onDeleteSession={props.onDeleteSession}
          onExportSession={props.onExportSession}
          onShareSession={props.onShareSession}
          onForkSession={props.onForkSession}
        />
      </Show>

      <div class="chat__main-col">
        <Show
          when={onChat()}
          fallback={
            <DiscoveryView
              route={railRoute()}
              client={discoveryClient}
              onBackToChat={() => setRailRoute('sessions')}
            />
          }
        >
        <header class="chat__topbar">
          <div class="chat__crumbs">
            <span class="chat__crumb chat__crumb-head">
              {activeRow()?.title ?? 'No session'}
            </span>
            <Show when={activeRow()?.workspace}>
              <span class="chat__crumb-sep">/</span>
              <span class="chat__crumb">{activeRow()?.workspace}</span>
            </Show>
          </div>
          <div class="chat__meta">
            <Show when={(props.sessionCostUsd ?? 0) > 0}>
              <span
                class="chat__meta-item chat__meta-item--cost"
                data-testid="session-cost-chip"
              >
                ${(props.sessionCostUsd ?? 0).toFixed(4)}
              </span>
            </Show>
            <Show when={props.lastStopReason}>
              <span
                class={
                  'chat__meta-item ' +
                  (props.lastStopReason === 'error'
                    ? 'chat__meta-item--err'
                    : '')
                }
                data-testid="stop-reason-chip"
              >
                {props.lastStopReason}
              </span>
            </Show>
            <Show when={props.sseStatus}>
              <span class="chat__meta-item" data-testid="sse-status-chip">
                sse · {props.sseStatus}
              </span>
            </Show>
            <span class="chat__meta-item" data-testid="density-chip">
              density · {props.density}
            </span>
          </div>
          <div class="chat__topbar-actions">
            <button
              type="button"
              class="chat__iconbtn"
              title="Cycle density (Ctrl+O)"
              onClick={() => cycleDensity(props.density, props.setDensity)}
              data-testid="topbar-density"
            >
              <Icon name="menu" size={14} />
            </button>
            <button
              type="button"
              class="chat__iconbtn"
              title="Command palette (Ctrl+K)"
              onClick={() => setPaletteOpen(true)}
              data-testid="topbar-palette"
            >
              <Icon name="palette" size={14} />
            </button>
            <button
              type="button"
              class={'chat__iconbtn ' + (inspectorOpen() ? 'is-active' : '')}
              title="Toggle inspector"
              onClick={() => setInspectorOpen((v) => !v)}
              data-testid="topbar-inspector"
            >
              <Icon name="panel-right" size={14} />
            </button>
          </div>
        </header>

        <div class="chat__pane" data-testid="transcript-pane">
          <div class="chat__pane-inner">
            <Show when={props.messages.length === 0 && !props.pendingPermission}>
              <EmptyState
                hasSession={!!props.activeId}
                onPrompt={(p) => void props.onSubmit?.(p)}
              />
            </Show>
            <Show when={props.pendingPermission}>
              <PermissionCard
                request={props.pendingPermission!}
                onDecide={props.onPermissionDecide}
              />
            </Show>
            <Transcript
              messages={props.messages}
              density={props.density}
              onOpenDiff={(d) => setActiveDiff(d)}
              onCopy={props.onCopyMessage}
              onRegenerate={props.onRegenerate}
              onEdit={props.onEditMessage}
              selectedId={selectedMessageId()}
              onSelect={(m) => setSelectedMessageId(m.id)}
            />
            <Show when={props.streaming && props.messages.length > 0}>
              <div class="chat__typing" data-testid="chat-typing">
                <span class="chat__typing-avatar" aria-hidden>
                  <Icon name="bot" size={14} />
                </span>
                <span class="chat__typing-label">CLIO is responding</span>
                <span class="chat__typing-dots" aria-hidden>
                  <span class="chat__typing-dot" />
                  <span class="chat__typing-dot" />
                  <span class="chat__typing-dot" />
                </span>
              </div>
            </Show>
          </div>
        </div>

        <Composer
          backendLabel={hostFromUrl(props.backendUrl)}
          disabled={props.composerDisabled}
          streaming={props.streaming}
          onStop={props.onStop}
          onSubmit={props.onSubmit}
          onSlashTyped={() => setPaletteOpen(true)}
          models={props.models}
          selectedModelId={props.selectedModelId}
          onPickModel={props.onPickModel}
          permMode={props.permMode}
          onPickPermMode={props.onPickPermMode}
          backendSlot={
            <BackendPicker
              onOpenSettings={props.onOpenSettings}
              onAddRemote={props.onAddRemote}
            />
          }
        />
        </Show>
      </div>

      <Show when={onChat() && inspectorOpen()}>
        <InspectorDrawer
          open
          message={inspectorTarget()}
          toolCalls={toolCallsForInspector()}
          costUsd={props.sessionCostUsd ?? 0}
          tokens={inspectorTarget()?.tokens}
          model={inspectorTarget()?.model?.model_id}
          onClose={() => setInspectorOpen(false)}
        />
      </Show>

      <Show when={activeDiff()}>
        <DiffPane diff={activeDiff()!} onClose={() => setActiveDiff(null)} />
      </Show>

      <SlashPalette
        open={paletteOpen()}
        query={paletteQuery()}
        commands={mergedSlashCommands(props.slashCommands)}
        onQueryChange={setPaletteQuery}
        onPick={handlePick}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}

function DiscoveryView(props: {
  route: RailRoute;
  client: Client;
  onBackToChat: () => void;
}) {
  return (
    <Show when={props.route !== 'sessions'}>
      <Switch>
        <Match when={props.route === 'workspaces'}>
          <WorkspacesPage client={props.client} />
        </Match>
        <Match when={props.route === 'agents'}>
          <AgentsPage client={props.client} />
        </Match>
        <Match when={props.route === 'tools'}>
          <ToolsPage client={props.client} />
        </Match>
        <Match when={props.route === 'mcp'}>
          <McpPage client={props.client} />
        </Match>
        <Match when={props.route === 'memory'}>
          <MemoryPage client={props.client} />
        </Match>
        <Match when={props.route === 'metrics'}>
          <MetricsPage client={props.client} />
        </Match>
        <Match when={props.route === 'doctor'}>
          <DoctorPage client={props.client} />
        </Match>
      </Switch>
    </Show>
  );
}

function EmptyState(props: {
  hasSession: boolean;
  onPrompt: (text: string) => void;
}) {
  const PROMPTS = [
    {
      eyebrow: 'Inspect',
      label: 'Show me the schema of data/sample.h5 and chart the largest 3 datasets.',
    },
    {
      eyebrow: 'Refactor',
      label: 'Find println calls in src/ and rewrite them to log.Info.',
    },
    {
      eyebrow: 'Explain',
      label: 'Walk me through the SSE event flow in this repo.',
    },
    {
      eyebrow: 'Plan',
      label: 'Draft a migration plan from CSV to Parquet for our pipeline.',
    },
  ];
  return (
    <div class="chat__empty">
      <div class="chat__empty-icon">
        <Icon name="sparkle" size={32} />
      </div>
      <h2 class="chat__empty-title">
        {props.hasSession ? 'Start the conversation' : 'Pick a session or start fresh'}
      </h2>
      <p class="chat__empty-body">
        CLIO is wired into your workspace — ask about your data, propose a
        change, kick off a tool. Anything you'd type into the terminal,
        you can drop here.
      </p>
      <div class="chat__empty-prompts">
        <For each={PROMPTS}>
          {(p) => (
            <button
              type="button"
              class="chat__empty-prompt"
              onClick={() => props.onPrompt(p.label)}
            >
              <div class="chat__empty-prompt-eyebrow">{p.eyebrow}</div>
              {p.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

function cycleDensity(
  cur: TranscriptDensity,
  set: (d: TranscriptDensity) => void,
) {
  if (cur === 'verbose') set('normal');
  else if (cur === 'normal') set('summary');
  else set('verbose');
}

function firstFileDiff(messages: Message[]): FileDiff | null {
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === 'file_diff') return p;
    }
  }
  return null;
}

function hostFromUrl(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

/**
 * Merge SPEC §/v1/commands output with our local default palette so the
 * keyboard-driven nav always has the meta commands (/settings, /clear,
 * /help) even when the backend doesn't ship them. Backend-supplied
 * commands win on id collision.
 */
function mergedSlashCommands(
  backend: SlashCommandDef[] | undefined,
): SlashCommand[] {
  const map = new Map<string, SlashCommand>();
  for (const d of DEFAULT_COMMANDS) map.set(d.id, d);
  for (const c of backend ?? []) {
    map.set(c.id, {
      id: c.id,
      trigger: c.id,
      description: c.description ?? c.title ?? '',
      category: c.source ?? 'backend',
    });
  }
  return Array.from(map.values());
}
