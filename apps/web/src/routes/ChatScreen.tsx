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
import type { RunningTool } from '../live.js';
import type { ModelOption, PermissionMode } from '../components/Composer.js';
import type { BackendHandle } from '../App.js';
import { fixturesForDemo } from '../fixtures/demo.js';
import { createLiveSessions, createLiveTranscript } from '../live.js';

import { BackendPicker } from '../components/BackendPicker.js';
import { Composer } from '../components/Composer.js';
import { DiffPane } from '../components/DiffPane.js';
import { Icon } from '../components/Icon.js';
import { InspectorDrawer, summarizeToolCalls } from '../components/InspectorDrawer.js';
import {
  addDetached,
  detachedAgo,
  listDetached,
  removeDetached,
  type DetachedSession,
} from '../detached.js';
import { CatalogBrowser } from '../components/CatalogBrowser.js';
import { ComposeModal } from '../components/ComposeModal.js';
import { SharedSessionModal } from '../components/SharedSessionModal.js';
import { KeybindCheatsheet } from '../components/KeybindCheatsheet.js';
import { NotificationCenter } from '../components/NotificationCenter.js';
import { ServerSearchPanel } from '../components/ServerSearchPanel.js';
import { TranscriptSearch } from '../components/TranscriptSearch.js';
import { LeftRail, type RailRoute } from '../components/LeftRail.js';
import { PermissionCard } from '../components/PermissionCard.js';
import { UserQuestionCard } from '../components/UserQuestionCard.js';
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
  PromptsPage,
  ToolsPage,
  WorkspacesPage,
} from './discovery/index.js';
import { Client } from '@clio/core';
import { getRequestLocale } from '../locale.js';
import { inTauri, tauriFetch } from '../tauri.js';
import { useToast } from '../components/Toast.js';
import {
  createPersistedBoolean,
  createPersistedSignal,
  createPersistedString,
} from '../persisted.js';
import './chat.css';

import type { SettingsSection } from './SettingsShell.js';

export interface ChatScreenProps {
  backend: BackendHandle;
  onOpenSettings?: (section?: SettingsSection) => void;
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

  const pinnedKey = `clio.pinned.${props.backend.url}`;
  const [pinnedIds, setPinnedIds] = createSignal<Set<string>>(loadPinnedSet(pinnedKey));

  function togglePin(id: string) {
    let nextPinned = false;
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        nextPinned = false;
      } else {
        next.add(id);
        nextPinned = true;
      }
      try { localStorage.setItem(pinnedKey, JSON.stringify([...next])); }
      catch { /* ignore */ }
      return next;
    });
    // Mirror to the server so other clients (TUI) see the same pin
    // state. Failure is non-fatal — the local store remains authoritative.
    void live.client
      .patchSession(id, { metadata: { pinned: nextPinned } })
      .catch(() => {
        /* server-side metadata write best-effort */
      });
  }

  const rows = createMemo<SessionRow[]>(() => {
    const s = live.sessions() ?? [];
    const pins = pinnedIds();
    return s.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      workspace: row.project,
      updatedAt: row.updatedAt,
      // The row is pinned if either local state or the server says so.
      // Server-side `metadata.pinned` mirrors the TUI; local set wins
      // when the user just toggled and the server hasn't responded.
      pinned: pins.has(row.id) || row.metaPinned === true,
      ...(row.bumpedAt ? { bumpedAt: row.bumpedAt } : {}),
    }));
  });

  const [activeId, setActiveId] = createPersistedString(
    `clio.active-session.${props.backend.url}`,
    '',
  );
  createEffect(() => {
    const list = rows();
    // If the persisted active id is gone (session deleted on another
    // client, or fresh backend), fall through to the most-recent.
    if (activeId() && !list.some((r) => r.id === activeId()) && list.length > 0) {
      setActiveId(list[0]!.id);
      return;
    }
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

  const [recentlyRenamed, setRecentlyRenamed] = createSignal<{ sid: string; expiry: number } | null>(null);
  let renameTimer: ReturnType<typeof setTimeout> | undefined;

  // Detached registry — sessions the user explicitly walked away from
  // (Cmd+Shift+D). Hydrated from localStorage so the list survives a
  // reload, scoped per backend URL.
  const [detachedSessions, setDetachedSessions] = createSignal<DetachedSession[]>(
    listDetached(props.backend.url),
  );

  function reattachDetached(sid: string) {
    removeDetached(props.backend.url, sid);
    setDetachedSessions(listDetached(props.backend.url));
  }

  function walkAwayFromActive() {
    const sid = activeId();
    const row = rows().find((r) => r.id === sid);
    if (!sid || !row) return;
    addDetached(props.backend.url, {
      id: sid,
      title: row.title,
      ...(row.preview ? { preview: row.preview } : {}),
      ...(row.workspace ? { workspace: row.workspace } : {}),
    });
    setDetachedSessions(listDetached(props.backend.url));
    toast.push({
      tone: 'info',
      title: 'Walked away',
      body: `${row.title} parked — open Cmd+K to re-attach.`,
      duration: 3200,
    });
  }

  const transcript = createLiveTranscript(live.client, activeId, {
    patch: live.patch,
    setRaw: live.setRaw,
    refetch: live.refetch,
    onTitleChanged: (sid) => {
      const expiry = Date.now() + 4500;
      setRecentlyRenamed({ sid, expiry });
      if (renameTimer) clearTimeout(renameTimer);
      renameTimer = setTimeout(() => {
        const cur = recentlyRenamed();
        if (cur && Date.now() >= cur.expiry) setRecentlyRenamed(null);
      }, 4600);
    },
    onFrameChanged: () => {
      // SSE flips a frame state — pull fresh from
      // /v1/sessions/{id}/context/frames so the Inspector list updates.
      void refetchFrames();
    },
    onNotification: (n) => {
      const tone =
        n.level === 'error' ? 'error' : n.level === 'warning' ? 'warn' : 'info';
      toast.push({
        tone,
        title: n.title,
        ...(n.body ? { body: n.body } : {}),
        duration: tone === 'error' ? 6000 : 3500,
      });
    },
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
    try {
      await live.client.sendMessage(sessionId, { text });
    } catch (e) {
      // Common cause: no LM configured. Surface the backend's typed
      // error envelope instead of leaving the user wondering.
      const msg = e instanceof Error ? e.message : String(e);
      const isLmIssue = /lm_provider|provider|api_key|api_base|model/i.test(msg);
      toast.push({
        tone: 'error',
        title: isLmIssue ? 'LM not configured' : 'Send failed',
        body: isLmIssue
          ? `${msg} — pick a provider in Settings → Models.`
          : msg,
        duration: 6000,
      });
    }
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

  async function answerQuestion(
    body: { answer?: string; selected_options?: string[] },
  ) {
    const q = transcript.pendingQuestion();
    const id = activeId();
    if (!q || !id) return;
    try {
      await live.client.answerSessionQuestion(id, q.id, body);
      // SSE will clear the card via user_question.answered.
      await transcript.refetch();
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Answer failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function cancelQuestion() {
    const q = transcript.pendingQuestion();
    const id = activeId();
    if (!q || !id) return;
    try {
      await live.client.cancelSessionQuestion(id, q.id);
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Cancel failed',
        body: e instanceof Error ? e.message : String(e),
      });
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

  async function importSession(blob: Record<string, unknown>) {
    try {
      const created = await live.client.importSession(blob);
      live.refetch();
      setActiveId(created.id);
      toast.push({
        tone: 'success',
        title: 'Session imported',
        body: created.title ?? created.id,
        duration: 3000,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Import failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
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
      try { localStorage.removeItem(`clio.draft.${id}`); }
      catch { /* ignore */ }
      toast.push({ tone: 'success', title: 'Session deleted', duration: 2200 });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Delete failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function exportSession(id: string, format: 'json' | 'md' = 'json') {
    try {
      const payload = await live.client.exportSession(id);
      const body = format === 'md' ? sessionToMarkdown(payload) : JSON.stringify(payload, null, 2);
      const mime = format === 'md' ? 'text/markdown' : 'application/json';
      const ext = format === 'md' ? 'md' : 'json';
      const blob = new Blob([body], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clio-session-${id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.push({
        tone: 'success',
        title: 'Session exported',
        body: `clio-session-${id}.${ext}`,
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

  async function compactActive() {
    const id = activeId();
    if (!id) return;
    try {
      await live.client.compactSession(id);
      toast.push({
        tone: 'info',
        title: 'Compacting…',
        body: 'Backend will emit session.compacted when done.',
        duration: 3000,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Compact failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function undoActive() {
    const id = activeId();
    if (!id) return;
    if (!confirm('Drop the last message from this session?')) return;
    try {
      await live.client.undoSession(id, { count: 1 });
      await transcript.refetch();
      toast.push({
        tone: 'success',
        title: 'Last message dropped',
        duration: 2200,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Undo failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function summarizeActive() {
    const id = activeId();
    if (!id) return;
    try {
      await live.client.summarizeSession(id, { auto: true });
      toast.push({
        tone: 'info',
        title: 'Summarizing…',
        body: 'The backend will emit a session.summarized event when done.',
        duration: 3000,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Summarize failed',
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

  // Live session tasks — feeds the Inspector Tasks tab.
  const [sessionTasksData, { refetch: refetchTasks }] = createResource(
    () => activeId(),
    async (sid) => {
      if (!sid) return { tasks: [] };
      try {
        return await live.client.sessionTasks(sid);
      } catch {
        return { tasks: [] };
      }
    },
  );
  const sessionTasks = createMemo(() => sessionTasksData()?.tasks ?? []);
  void refetchTasks;

  // Live context files — feeds the Inspector Context tab.
  const [contextFilesData, { refetch: refetchContextFiles }] = createResource(
    () => activeId(),
    async (sid) => {
      if (!sid) return { files: [] };
      try {
        return await live.client.sessionContextFiles(sid);
      } catch {
        return { files: [] };
      }
    },
  );
  const contextFiles = createMemo(() => contextFilesData()?.files ?? []);

  // Context frames — feeds the Inspector Frames tab. Cap is gated
  // because not every backend ships memory frames.
  const [framesData, { refetch: refetchFrames }] = createResource(
    () => activeId(),
    async (sid) => {
      if (!sid) return { frames: [] };
      try {
        return await live.client.sessionContextFrames(sid);
      } catch {
        return { frames: [] };
      }
    },
  );
  const contextFrames = createMemo(() => framesData()?.frames ?? []);

  // Session-wide pending diffs — feeds the Inspector Diffs tab's
  // "All pending in session" sub-section. Fetched once per session
  // switch; SSE delta on message.completed forces a refetch.
  const [sessionDiffsData, { refetch: refetchSessionDiffs }] = createResource(
    () => activeId(),
    async (sid) => {
      if (!sid) return { diffs: [] };
      try {
        return await live.client.sessionDiffs(sid);
      } catch {
        return { diffs: [] };
      }
    },
  );
  const sessionDiffs = createMemo(() => sessionDiffsData()?.diffs ?? []);
  void refetchSessionDiffs;

  // Per-session schedules — cron triggers from /v1/sessions/{id}/schedules.
  // Capability-gated upstream; the resource silently returns [] when the
  // endpoint 501s so the tab still renders the create form.
  const [schedulesData, { refetch: refetchSchedules }] = createResource(
    () => activeId(),
    async (sid) => {
      if (!sid) return { schedules: [] };
      try {
        return await live.client.sessionSchedules(sid);
      } catch {
        return { schedules: [] };
      }
    },
  );
  const schedules = createMemo(() => schedulesData()?.schedules ?? []);

  // Per-session blueprint + expert-pack bindings (PR #386/#387, #344).
  const [bindingsData, { refetch: refetchBindings }] = createResource(
    () => activeId(),
    async (sid) => {
      if (!sid) return null;
      try {
        const [bp, pack, bpList, packList] = await Promise.allSettled([
          live.client.getSessionBlueprint(sid),
          live.client.getSessionExpertPack(sid),
          live.client.agentBlueprints(),
          live.client.expertPacks(),
        ]);
        const blueprint_id =
          bp.status === 'fulfilled' ? (bp.value.blueprint_id ?? null) : null;
        const pack_id =
          pack.status === 'fulfilled' ? (pack.value.pack_id ?? null) : null;
        const availableBlueprints =
          bpList.status === 'fulfilled'
            ? bpList.value.blueprints.map((b) => ({
                id: b.id,
                label: b.name ?? b.id,
                ...(b.description ? { description: b.description } : {}),
              }))
            : [];
        const availablePacks =
          packList.status === 'fulfilled'
            ? packList.value.packs.map((p) => ({
                id: p.id,
                label: p.name ?? p.id,
                ...(p.description ? { description: p.description } : {}),
              }))
            : [];
        return { blueprint_id, pack_id, availableBlueprints, availablePacks };
      } catch {
        return null;
      }
    },
  );
  const sessionBindings = createMemo(() => bindingsData());

  async function bindBlueprint(blueprintId: string | null) {
    const sid = activeId();
    if (!sid) return;
    try {
      await live.client.setSessionBlueprint(sid, { blueprint_id: blueprintId });
      void refetchBindings();
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Could not bind blueprint',
        body: e instanceof Error ? e.message : String(e),
        duration: 5000,
      });
    }
  }

  async function bindExpertPack(packId: string | null) {
    const sid = activeId();
    if (!sid) return;
    try {
      await live.client.setSessionExpertPack(sid, { pack_id: packId });
      void refetchBindings();
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Could not bind expert pack',
        body: e instanceof Error ? e.message : String(e),
        duration: 5000,
      });
    }
  }

  async function createSchedule(body: { cron: string; prompt: string }) {
    const sid = activeId();
    if (!sid) return;
    try {
      await live.client.createSchedule(sid, body);
      void refetchSchedules();
      toast.push({
        tone: 'success',
        title: 'Schedule added',
        body: body.cron,
        duration: 2400,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Could not add schedule',
        body: e instanceof Error ? e.message : String(e),
        duration: 5000,
      });
    }
  }

  async function deleteScheduleById(scheduleId: string) {
    try {
      await live.client.deleteSchedule(scheduleId);
      void refetchSchedules();
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Could not delete schedule',
        body: e instanceof Error ? e.message : String(e),
        duration: 5000,
      });
    }
  }

  async function pinFileToContext(path: string) {
    const sid = activeId();
    if (!sid) return;
    try {
      await live.client.addContextFile(sid, { path, mode: 'read' });
      void refetchContextFiles();
      toast.push({
        tone: 'success',
        title: 'Pinned to context',
        body: path,
        duration: 2400,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Pin failed',
        body: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function removeContextFile(path: string) {
    const sid = activeId();
    if (!sid) return;
    try {
      await live.client.removeContextFile(sid, path);
      void refetchContextFiles();
      toast.push({
        tone: 'success',
        title: 'Removed from context',
        body: path,
        duration: 2200,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Remove failed',
        body: e instanceof Error ? e.message : String(e),
      });
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
    if (streaming()) {
      toast.push({
        tone: 'warn',
        title: 'Already streaming',
        body: 'Wait for the current turn to finish before regenerating.',
        duration: 2500,
      });
      return;
    }
    // Find the user message immediately before msg, re-send its text.
    const msgs = transcript.messages();
    const idx = msgs.findIndex((m) => m.id === msg.id);
    for (let i = idx - 1; i >= 0; i--) {
      const candidate = msgs[i];
      if (candidate?.role !== 'user') continue;
      const textPart = candidate.parts.find((p) => p.type === 'text');
      if (textPart && textPart.type === 'text' && textPart.text) {
        toast.push({
          tone: 'info',
          title: 'Regenerating',
          body: `Re-sending: "${textPart.text.slice(0, 60)}${textPart.text.length > 60 ? '…' : ''}"`,
          duration: 2200,
        });
        try {
          await live.client.sendMessage(id, { text: textPart.text });
        } catch (e) {
          toast.push({
            tone: 'error',
            title: 'Regenerate failed',
            body: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }
    }
    toast.push({
      tone: 'warn',
      title: 'Nothing to regenerate',
      body: 'No prior user message found above this turn.',
      duration: 2500,
    });
  }

  function quoteMessage(msg: Message) {
    const text = messageToText(msg);
    if (!text) return;
    // Prepend each line with '> ' to form a markdown blockquote.
    const quoted = text
      .split('\n')
      .map((line) => '> ' + line)
      .join('\n');
    const ta = document.querySelector(
      '[data-testid="composer-input"]',
    ) as HTMLTextAreaElement | null;
    if (!ta) return;
    const cur = ta.value;
    const prefix = cur && !cur.endsWith('\n') ? cur + '\n\n' : cur;
    ta.value = prefix + quoted + '\n\n';
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.scrollTop = ta.scrollHeight;
  }

  async function deleteMessage(msg: Message) {
    const id = activeId();
    if (!id) return;
    try {
      await live.client.deleteMessage(id, msg.id);
      await transcript.refetch();
      toast.push({
        tone: 'success',
        title: 'Message deleted',
        duration: 2200,
      });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Delete failed',
        body: e instanceof Error ? e.message : String(e),
      });
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
      pendingQuestion={transcript.pendingQuestion()}
      onSubmit={sendUserMessage}
      onPermissionDecide={decidePermission}
      onAnswerQuestion={answerQuestion}
      onCancelQuestion={cancelQuestion}
      onStop={stopRun}
      onNewSession={newEmptySession}
      onRefreshSessions={() => live.refetch()}
      onImportSession={importSession}
      onRenameSession={renameSession}
      onDeleteSession={deleteSession}
      onExportSession={exportSession}
      onShareSession={shareSession}
      onForkSession={forkSession}
      onTogglePin={togglePin}
      onSummarize={summarizeActive}
      onUndoTurn={undoActive}
      onCompactSession={compactActive}
      models={models()}
      selectedModelId={selectedModelId()}
      onPickModel={pickModel}
      permMode={permMode()}
      onPickPermMode={pickPermMode}
      slashCommands={slashCommands()}
      sessionTasks={sessionTasks()}
      onCycleTaskStatus={async (tid, next) => {
        try {
          await live.client.patchSessionTask(tid, { status: next });
          void refetchTasks();
        } catch (e) {
          toast.push({
            tone: 'error',
            title: 'Could not update task',
            body: e instanceof Error ? e.message : String(e),
            duration: 5000,
          });
        }
      }}
      contextFiles={contextFiles()}
      contextFrames={contextFrames()}
      onLoadFrameDetail={(fid) => {
        const sid = activeId();
        if (!sid) return Promise.reject(new Error('no active session'));
        return live.client.sessionContextFrame(sid, fid);
      }}
      sessionDiffs={sessionDiffs()}
      schedules={schedules()}
      onCreateSchedule={
        props.backend.capabilities?.capabilities?.scheduled_sessions
          ? createSchedule
          : undefined
      }
      onDeleteSchedule={
        props.backend.capabilities?.capabilities?.scheduled_sessions
          ? deleteScheduleById
          : undefined
      }
      sessionBindings={sessionBindings() ?? undefined}
      onSetBlueprint={bindBlueprint}
      onSetExpertPack={bindExpertPack}
      detachedSessions={detachedSessions()}
      onReattachDetached={reattachDetached}
      onWalkAway={walkAwayFromActive}
      onRunCommand={(id, args) => {
        const sid = activeId();
        if (!sid) return Promise.reject(new Error('no active session'));
        return live.client.runCommand(sid, id, args);
      }}
      onRemoveContextFile={removeContextFile}
      onCopyMessage={copyMessageToClipboard}
      onRegenerate={regenerateMessage}
      onEditMessage={editMessage}
      onQuoteMessage={quoteMessage}
      onDeleteMessage={deleteMessage}
      onCopyMessagePermalink={async (msg) => {
        const sid = activeId();
        if (!sid) return;
        const link = `clio://session/${sid}#${msg.id}`;
        try {
          await navigator.clipboard.writeText(link);
          toast.push({
            tone: 'success',
            title: 'Link copied',
            body: link,
            duration: 2500,
          });
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
      onSpeakMessage={async (msg) => {
        const sid = activeId();
        if (!sid) return;
        const text = messageToText(msg).slice(0, 4000);
        if (!text.trim()) return;
        try {
          const blob = await live.client.synthesizeVoice(sid, text);
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.addEventListener('ended', () => URL.revokeObjectURL(url));
          await audio.play();
        } catch (e) {
          toast.push({
            tone: 'error',
            title: 'TTS failed',
            body: e instanceof Error ? e.message : String(e),
            duration: 4000,
          });
        }
      }}
      onPinFile={pinFileToContext}
      composerDisabled={false}
      renamedSessionId={recentlyRenamed()?.sid ?? null}
      streaming={streaming()}
      sseStatus={transcript.status()}
      sseReconnectInSec={transcript.reconnectInSec()}
      runningTools={transcript.runningTools()}
      sessionCostUsd={transcript.costUsd()}
      sessionTokens={transcript.lastCompletion()?.tokens}
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
  pendingQuestion?: import('@clio/core').UserQuestion | null;
  onSubmit?: (text: string) => Promise<void> | void;
  onPermissionDecide?: (decision: 'approve' | 'deny', scope?: PermissionScope) => void;
  onAnswerQuestion?: (body: { answer?: string; selected_options?: string[] }) => void | Promise<void>;
  onCancelQuestion?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  composerDisabled: boolean;
  streaming?: boolean;
  sseStatus?: 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting';
  sseReconnectInSec?: number;
  runningTools?: RunningTool[];
  sessionTokens?: { input?: number; output?: number; total?: number };
  preOpen?: string | null;
  sessionCostUsd?: number;
  /** When set to the active session id and recent, the topbar flashes
   * a "renamed" pill so the user notices an auto-rename. */
  renamedSessionId?: string | null;
  lastStopReason?: string;
  onNewSession?: () => void | Promise<void>;
  onOpenSettings?: (section?: SettingsSection) => void;
  onAddRemote?: () => void;
  caps?: BackendHandle['capabilities'];
  /** SessionsColumn workspace switcher wiring (LiveDriven path only). */
  workspaces?: WorkspaceOption[];
  selectedWorkspaceId?: string;
  onPickWorkspace?: (id: string) => void;
  /** Manual refresh for the sessions list (LiveDriven path only). */
  onRefreshSessions?: () => void | Promise<void>;
  /** Import a session from a JSON export (LiveDriven path only). */
  onImportSession?: (blob: Record<string, unknown>) => void | Promise<void>;
  /** Per-session actions (LiveDriven path only). */
  onRenameSession?: (id: string, nextTitle: string) => void | Promise<void>;
  onDeleteSession?: (id: string) => void | Promise<void>;
  onExportSession?: (id: string, format?: 'json' | 'md') => void | Promise<void>;
  onShareSession?: (id: string) => void | Promise<void>;
  onForkSession?: (id: string) => void | Promise<void>;
  onTogglePin?: (id: string) => void;
  onSummarize?: () => void | Promise<void>;
  onUndoTurn?: () => void | Promise<void>;
  onCompactSession?: () => void | Promise<void>;
  /** Composer wiring (LiveDriven path only). */
  models?: ModelOption[];
  selectedModelId?: string;
  onPickModel?: (m: ModelOption) => void | Promise<void>;
  permMode?: PermissionMode;
  onPickPermMode?: (m: PermissionMode) => void | Promise<void>;
  slashCommands?: SlashCommandDef[];
  sessionTasks?: import('@clio/core').SessionTask[];
  contextFiles?: import('@clio/core').ContextFile[];
  contextFrames?: import('../components/InspectorDrawer.js').ContextFrameRow[];
  onLoadFrameDetail?: (frameId: string) => Promise<Record<string, unknown>>;
  sessionDiffs?: import('../components/InspectorDrawer.js').SessionDiffRow[];
  onCycleTaskStatus?: (
    taskId: string,
    next: import('@clio/core').SessionTask['status'],
  ) => void | Promise<void>;
  onSpeakMessage?: (msg: import('@clio/core').Message) => void | Promise<void>;
  onCopyMessagePermalink?: (msg: import('@clio/core').Message) => void | Promise<void>;
  schedules?: import('../components/InspectorDrawer.js').ScheduleRow[];
  onCreateSchedule?: (body: { cron: string; prompt: string }) => void | Promise<void>;
  onDeleteSchedule?: (scheduleId: string) => void | Promise<void>;
  sessionBindings?: import('../components/InspectorDrawer.js').SessionBindings;
  onSetBlueprint?: (id: string | null) => void | Promise<void>;
  onSetExpertPack?: (id: string | null) => void | Promise<void>;
  detachedSessions?: DetachedSession[];
  onReattachDetached?: (sessionId: string) => void;
  onWalkAway?: () => void;
  /** Execute a backend slash command via the structured endpoint
   * POST /v1/sessions/{id}/commands/{cmd}. */
  onRunCommand?: (commandId: string, args: Record<string, unknown>) => Promise<unknown>;
  onRemoveContextFile?: (path: string) => void | Promise<void>;
  /** Message-level actions. */
  onCopyMessage?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onEditMessage?: (msg: Message) => void;
  onQuoteMessage?: (msg: Message) => void;
  onDeleteMessage?: (msg: Message) => void;
  onPinFile?: (path: string) => void;
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

/**
 * Convert a backend session-export payload to a readable Markdown
 * document. Best-effort — we mirror the shape exporter currently
 * returns: `{session: {...}, messages: [...]}` with each message
 * carrying `role` + `parts[]`.
 */
function sessionToMarkdown(payload: unknown): string {
  const root = payload as {
    session?: { title?: string; id?: string; created_at?: string };
    messages?: Message[];
  };
  const sess = root.session ?? {};
  const messages = root.messages ?? [];
  const lines: string[] = [];
  lines.push(`# ${sess.title ?? 'CLIO session'}`);
  if (sess.id) lines.push(`*Session* \`${sess.id}\``);
  if (sess.created_at) lines.push(`*Started* ${sess.created_at}`);
  lines.push('');
  for (const m of messages) {
    const role = m.role ? m.role.toUpperCase() : 'MESSAGE';
    lines.push(`---`);
    lines.push(`### ${role}`);
    const text = messageToText(m);
    if (text) lines.push('', text, '');
  }
  return lines.join('\n');
}

function loadPinnedSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch { /* ignore */ }
  return new Set();
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
  const [cheatsheetOpen, setCheatsheetOpen] = createSignal(false);
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [composeOpen, setComposeOpen] = createSignal(false);
  const [sharedSessionOpen, setSharedSessionOpen] = createSignal(false);
  const [draftReloadTick, setDraftReloadTick] = createSignal(0);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [currentMatchIdx, setCurrentMatchIdx] = createSignal(0);
  const [serverSearchOpen, setServerSearchOpen] = createSignal(false);

  const totalMatches = createMemo(() => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return 0;
    let n = 0;
    for (const m of props.messages) {
      for (const part of m.parts) {
        if (part.type === 'text' && part.text) {
          const lower = part.text.toLowerCase();
          let i = lower.indexOf(q);
          while (i !== -1) {
            n += 1;
            i = lower.indexOf(q, i + q.length);
          }
        }
      }
    }
    return n;
  });

  const currentMatchKey = createMemo<string>(() => {
    const total = totalMatches();
    if (total === 0) return '';
    const q = searchQuery().trim().toLowerCase();
    if (!q) return '';
    const target = ((currentMatchIdx() % total) + total) % total;
    let seen = 0;
    for (const m of props.messages) {
      for (const part of m.parts) {
        if (part.type === 'text' && part.text) {
          const lower = part.text.toLowerCase();
          let i = lower.indexOf(q);
          while (i !== -1) {
            if (seen === target) return `${m.id}:${seen}`;
            seen += 1;
            i = lower.indexOf(q, i + q.length);
          }
        }
      }
    }
    return '';
  });

  // Scroll the focused match into view whenever it changes.
  createEffect(() => {
    const key = currentMatchKey();
    if (!key) return;
    queueMicrotask(() => {
      const el = document.querySelector(
        `[data-match-key="${CSS.escape(key)}"]`,
      ) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  function bumpMatch(delta: number) {
    const total = totalMatches();
    if (total === 0) return;
    setCurrentMatchIdx((i) => (i + delta + total) % total);
  }
  const [inspectorOpen, setInspectorOpen] = createPersistedBoolean(
    'clio.inspector-open.v1',
    true,
  );
  const [sessionsOpen, setSessionsOpen] = createPersistedBoolean(
    'clio.sessions-open.v1',
    true,
  );
  const [railRoute, setRailRoute] = createSignal<RailRoute>('sessions');
  const [selectedMessageId, setSelectedMessageId] = createSignal<string>('');
  const [scrolledUp, setScrolledUp] = createSignal(false);
  const [newSinceScroll, setNewSinceScroll] = createSignal(0);
  let paneEl: HTMLDivElement | undefined;
  let lastMessageCount = 0;

  function isAtBottom(el: HTMLElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function scrollToBottom() {
    if (!paneEl) return;
    paneEl.scrollTo({ top: paneEl.scrollHeight, behavior: 'smooth' });
    setScrolledUp(false);
    setNewSinceScroll(0);
  }

  function onPaneScroll() {
    if (!paneEl) return;
    const atBottom = isAtBottom(paneEl);
    if (atBottom) {
      setScrolledUp(false);
      setNewSinceScroll(0);
    } else {
      setScrolledUp(true);
    }
  }

  // Track new messages while the user is reading history; clear the
  // counter as soon as they scroll back to live. Conversely, if the
  // user is at the bottom and a new message arrives, autoscroll so
  // the streaming text stays in view.
  createEffect(() => {
    const count = props.messages.length;
    if (scrolledUp() && count > lastMessageCount) {
      setNewSinceScroll((n) => n + (count - lastMessageCount));
    } else if (!scrolledUp() && count > lastMessageCount && paneEl) {
      queueMicrotask(() => {
        if (paneEl) paneEl.scrollTop = paneEl.scrollHeight;
      });
    }
    lastMessageCount = count;
  });

  // When the active session changes, jump to the bottom (without
  // smooth scrolling so it feels instant) and focus the composer so
  // typing works immediately.
  createEffect(() => {
    void props.activeId; // dependency
    queueMicrotask(() => {
      if (paneEl) {
        paneEl.scrollTop = paneEl.scrollHeight;
        setScrolledUp(false);
        setNewSinceScroll(0);
      }
      const ta = document.querySelector(
        '[data-testid="composer-input"]',
      ) as HTMLTextAreaElement | null;
      // Don't steal focus if a modal/palette is open or the user is
      // already typing somewhere else (e.g. session-rename input).
      const ae = document.activeElement;
      const focusable =
        ae == null ||
        ae === document.body ||
        (ae as HTMLElement).dataset?.testid === 'composer-input';
      if (ta && focusable) ta.focus();
    });
  });

  // Shared Client for the discovery pages — same backend, routed
  // through gact_http inside Tauri to dodge CORS.
  const discoveryClient = new Client({
    baseUrl: props.backendUrl,
    fetch: inTauri() ? tauriFetch : undefined,
    getLocale: getRequestLocale,
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
        if (e.shiftKey) {
          setCatalogOpen((v) => !v);
        } else {
          setPaletteOpen((v) => !v);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setComposeOpen((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setSharedSessionOpen((v) => !v);
        return;
      }
      // Cmd/Ctrl+R — refresh the sessions list. We don't override
      // the browser-default unless we have a handler wired; otherwise
      // F5 / browser reload still works as expected.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && props.onRefreshSessions) {
        e.preventDefault();
        void props.onRefreshSessions();
        return;
      }
      // Cmd/Ctrl+E — quick-edit the last user message. Mirrors the
      // TUI's "press up to recall" affordance.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && props.onEditMessage) {
        const lastUser = [...props.messages]
          .reverse()
          .find((m) => m.role === 'user');
        if (lastUser) {
          e.preventDefault();
          void props.onEditMessage(lastUser);
          return;
        }
      }
      // Ctrl/Cmd+Shift+D — walk away from the active session and
      // park it in the detached registry so it surfaces in the
      // palette next time we open the app.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        props.onWalkAway?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setCheatsheetOpen((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && onChat()) {
        e.preventDefault();
        if (e.shiftKey) {
          setServerSearchOpen((v) => !v);
        } else {
          setSearchOpen(true);
          setCurrentMatchIdx(0);
        }
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 's' &&
        onChat() &&
        props.activeId
      ) {
        e.preventDefault();
        if (e.shiftKey) {
          if (props.onForkSession) void props.onForkSession(props.activeId);
        } else if (props.onExportSession) {
          void props.onExportSession(props.activeId);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        props.onOpenSettings?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i' && onChat()) {
        e.preventDefault();
        setInspectorOpen((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && onChat()) {
        e.preventDefault();
        setSessionsOpen((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void props.onNewSession?.();
        return;
      }
      // Ctrl+Shift+Up/Down — move active session forward/backward in
      // the SessionsColumn. Only fires on the chat route so it doesn't
      // hijack arrow keys on discovery pages.
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        onChat() &&
        props.sessions.length > 1
      ) {
        e.preventDefault();
        const list = props.sessions;
        const idx = list.findIndex((s) => s.id === props.activeId);
        if (idx === -1) {
          const first = list[0];
          if (first) props.onSelect(first.id);
        } else {
          const nextIdx =
            e.key === 'ArrowDown'
              ? (idx + 1) % list.length
              : (idx - 1 + list.length) % list.length;
          const target = list[nextIdx];
          if (target) {
            props.onSelect(target.id);
            queueMicrotask(() => {
              const el = document.querySelector(
                `[data-testid="session-row-${CSS.escape(target.id)}"]`,
              ) as HTMLElement | null;
              el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            });
          }
        }
        return;
      }
      if (e.key === 'Escape' && paletteOpen()) {
        setPaletteOpen(false);
        return;
      }
      // Esc stops a streaming turn when no overlay is consuming it
      // (palette, cheatsheet, search). Matches Cursor / Claude.ai.
      if (
        e.key === 'Escape' &&
        !paletteOpen() &&
        !cheatsheetOpen() &&
        !searchOpen() &&
        props.streaming &&
        props.onStop &&
        onChat()
      ) {
        e.preventDefault();
        void props.onStop();
      }
    };
    window.addEventListener('keydown', onKey, true);
    onCleanup(() => window.removeEventListener('keydown', onKey, true));
  });

  function handlePick(cmd: SlashCommand) {
    setPaletteOpen(false);

    // Dynamic items the layout injects (jump:<sid>, perm:<mode>, etc.)
    // are namespaced by id so they don't collide with backend slash
    // commands.
    if (cmd.id.startsWith('jump:')) {
      const sid = cmd.id.slice('jump:'.length);
      props.onSelect(sid);
      setRailRoute('sessions');
      return;
    }
    if (cmd.id.startsWith('detached:')) {
      const sid = cmd.id.slice('detached:'.length);
      // Re-attach: select the session, refetch the live list to pick it
      // up, and yank it out of the detached registry.
      props.onSelect(sid);
      setRailRoute('sessions');
      void props.onRefreshSessions?.();
      props.onReattachDetached?.(sid);
      return;
    }
    if (cmd.id.startsWith('perm:')) {
      const mode = cmd.id.slice('perm:'.length) as PermissionMode;
      void props.onPickPermMode?.(mode);
      return;
    }
    if (cmd.id.startsWith('rail:')) {
      const route = cmd.id.slice('rail:'.length) as RailRoute;
      setRailRoute(route);
      return;
    }
    if (cmd.id.startsWith('settings:')) {
      const section = cmd.id.slice('settings:'.length) as SettingsSection;
      props.onOpenSettings?.(section);
      return;
    }
    if (cmd.id === 'new-session') {
      void props.onNewSession?.();
      return;
    }
    if (cmd.id === 'copy-session-id' && props.activeId) {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(props.activeId).catch(() => undefined);
      }
      return;
    }
    if (cmd.id === 'cycle-density') {
      cycleDensity(props.density, props.setDensity);
      return;
    }
    if (cmd.id === 'summarize') {
      void props.onSummarize?.();
      return;
    }
    if (cmd.id === 'undo-turn') {
      void props.onUndoTurn?.();
      return;
    }
    if (cmd.id === 'compact-session') {
      void props.onCompactSession?.();
      return;
    }
    if (cmd.id === 'toggle-inspector') {
      setInspectorOpen((v) => !v);
      return;
    }
    if (cmd.id === 'open-shared-session') {
      setSharedSessionOpen(true);
      return;
    }
    if (cmd.id === 'walk-away') {
      props.onWalkAway?.();
      return;
    }
    if (cmd.id === 'compose-modal') {
      setComposeOpen(true);
      return;
    }
    if (cmd.id === 'export-md') {
      if (props.activeId && props.onExportSession) {
        void props.onExportSession(props.activeId, 'md');
      }
      return;
    }
    if (cmd.id === 'catalog-browser') {
      setCatalogOpen(true);
      return;
    }

    // First check for /v1/commands rooted by trigger or id — these
    // are backend-defined. Prefer POST /v1/sessions/{id}/commands/{cmd}
    // (structured route that preserves per-command arg schemas) and
    // fall back to "send as user message" only if the structured route
    // isn't available (404 / 501) or there's no active session.
    const isBackendRoute = !DEFAULT_COMMAND_IDS.has(cmd.id);
    if (isBackendRoute) {
      const run = props.onRunCommand;
      if (run && props.activeId) {
        void Promise.resolve(run(cmd.id, {})).catch(() => {
          // Last-resort fallback so the user still sees the command
          // resolve when the backend hasn't wired the structured route.
          void props.onSubmit?.(cmd.trigger);
        });
      } else {
        void props.onSubmit?.(cmd.trigger);
      }
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

  /**
   * Build the live palette items: backend + default slash commands
   * plus dynamic actions (jump to session, change perm mode, switch
   * rail route, copy id). This is what makes Ctrl+K useful as a
   * command palette and not just a slash list.
   */
  const paletteItems = createMemo<SlashCommand[]>(() => {
    const items = mergedSlashCommands(props.slashCommands);
    // Dynamic per-session jumps.
    for (const s of props.sessions.slice(0, 12)) {
      items.push({
        id: `jump:${s.id}`,
        trigger: `> ${s.title}`,
        description: s.workspace
          ? `Switch to session in ${s.workspace}`
          : 'Switch to session',
        category: 'jump',
      });
    }
    // Walked-away sessions from the detached registry — surfaced near
    // the top of the palette so re-entry is one keystroke.
    for (const d of props.detachedSessions ?? []) {
      // Don't double up — if the session is still in the live list,
      // the regular jump above is fine.
      if (props.sessions.some((s) => s.id === d.id)) continue;
      items.push({
        id: `detached:${d.id}`,
        trigger: `↶ ${d.title}`,
        description: `Walked away ${detachedAgo(d.detachedAt)} — Ctrl+. to dismiss`,
        category: 'jump',
      });
    }
    // Permission mode quick switches.
    const modes: PermissionMode[] = ['ask', 'auto-edits', 'plan', 'auto', 'bypass'];
    for (const m of modes) {
      if (m === props.permMode) continue;
      items.push({
        id: `perm:${m}`,
        trigger: `perm · ${m}`,
        description: `Set permission mode to ${m}`,
        category: 'perm',
      });
    }
    // Rail jumps for capabilities we know exist.
    const railJumps: Array<{ id: RailRoute; label: string }> = [
      { id: 'workspaces', label: 'Workspaces' },
      { id: 'agents', label: 'Agents' },
      { id: 'tools', label: 'Commands' },
      { id: 'prompts', label: 'Prompts' },
      { id: 'mcp', label: 'MCP servers' },
      { id: 'memory', label: 'Memory' },
      { id: 'metrics', label: 'Metrics' },
      { id: 'doctor', label: 'Doctor' },
    ];
    for (const r of railJumps) {
      items.push({
        id: `rail:${r.id}`,
        trigger: `go · ${r.label.toLowerCase()}`,
        description: `Open ${r.label}`,
        category: 'navigation',
      });
    }
    // Settings deep-links — palette can drop the user straight onto
    // the relevant pane without scrolling through a long settings shell.
    const settingsJumps: Array<{ id: SettingsSection; label: string }> = [
      { id: 'backends', label: 'Backends' },
      { id: 'workspaces', label: 'Workspaces' },
      { id: 'providers', label: 'Models & providers' },
      { id: 'agents', label: 'Agents' },
      { id: 'mcp', label: 'MCP servers' },
      { id: 'memory', label: 'Memory' },
      { id: 'metrics', label: 'Metrics' },
      { id: 'doctor', label: 'Doctor' },
      { id: 'appearance', label: 'Appearance' },
      { id: 'about', label: 'About' },
    ];
    for (const s of settingsJumps) {
      items.push({
        id: `settings:${s.id}`,
        trigger: `settings · ${s.label.toLowerCase()}`,
        description: `Open Settings → ${s.label}`,
        category: 'settings',
      });
    }
    items.push(
      {
        id: 'compose-modal',
        trigger: 'compose · fullscreen',
        description: 'Open the fullscreen compose modal (Ctrl+G)',
        category: 'action',
      },
      {
        id: 'catalog-browser',
        trigger: 'catalog · all',
        description: 'Unified search across agents/tools/MCP/prompts (Ctrl+Shift+K)',
        category: 'navigation',
      },
      {
        id: 'open-shared-session',
        trigger: 'open · shared session',
        description: 'Open a clio: share token (Ctrl+L)',
        category: 'action',
      },
      {
        id: 'export-md',
        trigger: 'export · markdown',
        description: 'Download the active session as a .md file',
        category: 'action',
      },
      {
        id: 'walk-away',
        trigger: 'walk away',
        description: 'Park the active session in the detached registry (Ctrl+Shift+D)',
        category: 'action',
      },
      {
        id: 'new-session',
        trigger: 'new session',
        description: 'Start a fresh session (Ctrl+N)',
        category: 'action',
      },
      {
        id: 'summarize',
        trigger: 'summarize session',
        description: 'Ask the backend to summarize this session',
        category: 'action',
      },
      {
        id: 'undo-turn',
        trigger: 'undo last turn',
        description: 'Drop the most recent message from this session',
        category: 'action',
      },
      {
        id: 'compact-session',
        trigger: 'compact session',
        description: 'Collapse history into a summary to free context window',
        category: 'action',
      },
      {
        id: 'copy-session-id',
        trigger: 'copy session id',
        description: props.activeId
          ? `Copy ${props.activeId}`
          : 'No session selected',
        category: 'action',
      },
      {
        id: 'cycle-density',
        trigger: 'cycle density',
        description: `Toggle transcript density (now: ${props.density})`,
        category: 'view',
      },
      {
        id: 'toggle-inspector',
        trigger: 'toggle inspector',
        description: 'Show / hide the inspector drawer',
        category: 'view',
      },
    );
    return items;
  });

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
      case 'reconnecting':
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
      class={
        'chat ' +
        (onChat() ? '' : 'chat--discovery') +
        (onChat() && inspectorOpen() ? ' chat--inspector-open' : '') +
        (onChat() && !sessionsOpen() ? ' chat--no-sessions' : '')
      }
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
          // Re-clicking Sessions while already on chat with the column
          // collapsed re-opens the column instead of being a no-op.
          if (id === 'sessions' && railRoute() === 'sessions' && !sessionsOpen()) {
            setSessionsOpen(true);
            return;
          }
          setRailRoute(id);
        }}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <Show when={onChat() && sessionsOpen()}>
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
          onRefresh={props.onRefreshSessions}
          onImportSession={props.onImportSession}
          onRenameSession={props.onRenameSession}
          onDeleteSession={props.onDeleteSession}
          onExportSession={props.onExportSession}
          onShareSession={props.onShareSession}
          onForkSession={props.onForkSession}
          onTogglePin={props.onTogglePin}
          archivedClient={discoveryClient}
        />
      </Show>

      <div class="chat__main-col">
        <Show
          when={onChat()}
          fallback={
            <DiscoveryView
              route={railRoute()}
              client={discoveryClient}
              activeSessionId={props.activeId}
              onBackToChat={() => setRailRoute('sessions')}
            />
          }
        >
        <header class="chat__topbar">
          <div class="chat__crumbs">
            <span
              class="chat__crumb chat__crumb-head"
              title={
                props.activeId
                  ? `Session ${props.activeId} — click to copy`
                  : 'No session'
              }
              onClick={() => {
                if (!props.activeId || typeof navigator === 'undefined') return;
                if (navigator.clipboard) {
                  void navigator.clipboard.writeText(props.activeId);
                }
              }}
              style="cursor: pointer"
            >
              {activeRow()?.title ?? 'No session'}
            </span>
            <Show when={props.renamedSessionId === props.activeId}>
              <span
                class="chat__rename-pill"
                data-testid="chat-renamed-pill"
                title="The backend just updated this session's title"
              >
                renamed
              </span>
            </Show>
            <Show when={activeRow()?.workspace}>
              <span class="chat__crumb-sep">/</span>
              <span class="chat__crumb">{activeRow()?.workspace}</span>
            </Show>
          </div>
          <div class="chat__meta">
            <Show when={activeRow()?.status === 'waiting_permission'}>
              <span
                class="chat__meta-item chat__meta-item--warn"
                data-testid="session-status-chip"
                title="Session is paused waiting for your approval on a tool call"
              >
                waiting · permission
              </span>
            </Show>
            <Show when={activeRow()?.status === 'error'}>
              <span
                class="chat__meta-item chat__meta-item--err"
                data-testid="session-status-chip"
                title="Session entered an error state"
              >
                session · error
              </span>
            </Show>
            <Show when={(props.sessionCostUsd ?? 0) > 0}>
              <span
                class="chat__meta-item chat__meta-item--cost"
                data-testid="session-cost-chip"
              >
                ${(props.sessionCostUsd ?? 0).toFixed(4)}
              </span>
            </Show>
            <Show
              when={
                (props.sessionTokens?.total ?? 0) > 0 ||
                (props.sessionTokens?.input ?? 0) +
                  (props.sessionTokens?.output ?? 0) >
                  0
              }
            >
              <span class="chat__meta-item" data-testid="tokens-chip">
                {humanTokens(props.sessionTokens)}
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
                <Show when={props.sseStatus === 'reconnecting' && (props.sseReconnectInSec ?? 0) > 0}>
                  {' in '}{props.sseReconnectInSec}s
                </Show>
              </span>
            </Show>
            <Show when={(props.runningTools?.length ?? 0) > 0}>
              {(() => {
                const tools = props.runningTools!;
                const first = tools[0];
                const pct =
                  first?.progress != null ? Math.round(first.progress * 100) : null;
                return (
                  <span
                    class="chat__meta-item chat__meta-item--running"
                    data-testid="running-tools-chip"
                    title={tools
                      .map((t) => `${t.toolName}${t.progressMessage ? ' — ' + t.progressMessage : ''}`)
                      .join('\n')}
                  >
                    <span class="chat__running-dot" aria-hidden />
                    running · {tools.slice(0, 2).map((t) => t.toolName).join(', ')}
                    <Show when={pct != null}>
                      {' '}{pct}%
                    </Show>
                    <Show when={tools.length > 2}>
                      {' +'}
                      {tools.length - 2}
                    </Show>
                  </span>
                );
              })()}
            </Show>
            <Show when={props.selectedModelId && props.models?.length}>
              {(() => {
                const m = props.models!.find((x) => x.id === props.selectedModelId);
                if (!m) return null;
                return (
                  <button
                    type="button"
                    class="chat__meta-item chat__meta-item--model chat__meta-item--clickable"
                    data-testid="model-chip"
                    title={`${m.providerLabel} · ${m.modelId} — click for Settings → Models`}
                    onClick={() => props.onOpenSettings?.('providers')}
                  >
                    <Icon name="sparkle" size={10} />
                    {m.modelId}
                  </button>
                );
              })()}
            </Show>
            <Show when={props.permMode && props.permMode !== 'ask'}>
              <button
                type="button"
                class={
                  'chat__meta-item chat__meta-item--clickable chat__meta-item--' +
                  (props.permMode === 'bypass' || props.permMode === 'auto'
                    ? 'err'
                    : 'warn')
                }
                title={`Permission mode: ${props.permMode} — click to change`}
                onClick={() => void props.onPickPermMode?.('ask')}
                data-testid="perm-mode-chip"
              >
                perm · {props.permMode}
              </button>
            </Show>
            <button
              type="button"
              class="chat__meta-item chat__meta-item--clickable"
              data-testid="density-chip"
              title="Cycle density (Ctrl+O)"
              onClick={() => cycleDensity(props.density, props.setDensity)}
            >
              density · {props.density}
            </button>
          </div>
          <div class="chat__topbar-actions">
            <NotificationCenter />
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

        <TranscriptSearch
          open={searchOpen()}
          query={searchQuery()}
          matchCount={totalMatches()}
          currentIndex={currentMatchIdx()}
          onQueryChange={(q) => {
            setSearchQuery(q);
            setCurrentMatchIdx(0);
          }}
          onPrev={() => bumpMatch(-1)}
          onNext={() => bumpMatch(1)}
          onClose={() => {
            setSearchOpen(false);
            setSearchQuery('');
          }}
        />

        <div
          class="chat__pane"
          data-testid="transcript-pane"
          ref={(el) => { paneEl = el; }}
          onScroll={onPaneScroll}
        >
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
            <Show when={props.pendingQuestion && props.onAnswerQuestion && props.onCancelQuestion}>
              <UserQuestionCard
                question={props.pendingQuestion!}
                onAnswer={props.onAnswerQuestion!}
                onCancel={props.onCancelQuestion!}
              />
            </Show>
            <Transcript
              messages={props.messages}
              density={props.density}
              onOpenDiff={(d) => setActiveDiff(d)}
              onCopy={props.onCopyMessage}
              onRegenerate={props.onRegenerate}
              onEdit={props.onEditMessage}
              onQuote={props.onQuoteMessage}
              onDelete={props.onDeleteMessage}
              onPinFile={props.onPinFile}
              onSpeak={props.onSpeakMessage}
              onCopyPermalink={props.onCopyMessagePermalink}
              selectedId={selectedMessageId()}
              onSelect={(m) => setSelectedMessageId(m.id)}
              searchQuery={searchOpen() ? searchQuery() : ''}
              currentMatchKey={currentMatchKey()}
              streaming={props.streaming}
            />
            <Show when={scrolledUp()}>
              <button
                type="button"
                class="chat__scroll-pill"
                onClick={scrollToBottom}
                data-testid="scroll-to-bottom"
              >
                <Icon name="chevron-down" size={14} />
                <Show when={newSinceScroll() > 0} fallback={<span>Jump to latest</span>}>
                  <span>{newSinceScroll()} new</span>
                </Show>
              </button>
            </Show>
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
          placeholder={
            props.activeId
              ? undefined
              : 'Start a new conversation — first message becomes the title'
          }
          onTranscribeVoice={async (blob, name) => {
            const sid = props.activeId;
            if (!sid) throw new Error('No active session for transcription');
            const r = await discoveryClient.transcribeVoice(sid, blob, name);
            return r.text;
          }}
          workspaceClient={discoveryClient}
          workspaceId={
            props.sessions.find((s) => s.id === props.activeId)?.workspace ??
            props.selectedWorkspaceId === '__all'
              ? undefined
              : props.selectedWorkspaceId
          }
          models={props.models}
          selectedModelId={props.selectedModelId}
          onPickModel={props.onPickModel}
          permMode={props.permMode}
          onPickPermMode={props.onPickPermMode}
          draftKey={props.activeId || '__new'}
          draftReloadTick={draftReloadTick()}
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
          tasks={props.sessionTasks}
          contextFiles={props.contextFiles}
          frames={props.contextFrames ?? []}
          onLoadFrameDetail={props.onLoadFrameDetail}
          onCycleTaskStatus={props.onCycleTaskStatus}
          sessionDiffs={props.sessionDiffs ?? []}
          schedules={props.schedules ?? []}
          onCreateSchedule={props.onCreateSchedule}
          onDeleteSchedule={props.onDeleteSchedule}
          bindings={props.sessionBindings}
          onSetBlueprint={props.onSetBlueprint}
          onSetExpertPack={props.onSetExpertPack}
          onRemoveContextFile={props.onRemoveContextFile}
          onOpenDiff={(d) => setActiveDiff(d)}
          onClose={() => setInspectorOpen(false)}
        />
      </Show>

      <Show when={activeDiff()}>
        <DiffPane diff={activeDiff()!} onClose={() => setActiveDiff(null)} />
      </Show>

      <SlashPalette
        open={paletteOpen()}
        query={paletteQuery()}
        commands={paletteItems()}
        onQueryChange={setPaletteQuery}
        onPick={handlePick}
        onClose={() => setPaletteOpen(false)}
      />

      <KeybindCheatsheet
        open={cheatsheetOpen()}
        onClose={() => setCheatsheetOpen(false)}
      />

      <SharedSessionModal
        open={sharedSessionOpen()}
        client={discoveryClient}
        onClose={() => setSharedSessionOpen(false)}
      />

      <ComposeModal
        open={composeOpen()}
        draftKey={props.activeId || '__new'}
        onSubmit={(text) => props.onSubmit?.(text)}
        onClose={() => {
          setComposeOpen(false);
          setDraftReloadTick((n) => n + 1);
        }}
      />

      <CatalogBrowser
        open={catalogOpen()}
        client={discoveryClient}
        onClose={() => setCatalogOpen(false)}
        onPick={(t) => {
          switch (t.kind) {
            case 'agent':
              setRailRoute('agents');
              return;
            case 'tool':
              setRailRoute('tools');
              return;
            case 'mcp':
              setRailRoute('mcp');
              return;
            case 'prompt':
              setRailRoute('prompts');
              return;
            case 'workspace':
              setRailRoute('workspaces');
              return;
          }
        }}
      />

      <Show when={props.activeId}>
        <ServerSearchPanel
          open={serverSearchOpen()}
          client={discoveryClient}
          sessionId={props.activeId}
          onJump={(mid) => {
            setSelectedMessageId(mid);
            queueMicrotask(() => {
              const el = document.querySelector(
                `[data-testid="msg-${CSS.escape(mid)}"]`,
              ) as HTMLElement | null;
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
          }}
          onClose={() => setServerSearchOpen(false)}
        />
      </Show>
    </div>
  );
}

function DiscoveryView(props: {
  route: RailRoute;
  client: Client;
  activeSessionId?: string;
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
        <Match when={props.route === 'prompts'}>
          <PromptsPage client={props.client} />
        </Match>
        <Match when={props.route === 'mcp'}>
          <McpPage client={props.client} />
        </Match>
        <Match when={props.route === 'memory'}>
          <MemoryPage
            client={props.client}
            activeSessionId={props.activeSessionId}
          />
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
      <p class="chat__empty-tip">
        Tip: press{' '}
        <kbd class="chat__empty-kbd">{platformMod()} + K</kbd> for the
        command palette, or{' '}
        <kbd class="chat__empty-kbd">{platformMod()} + /</kbd> for a
        keyboard shortcuts cheatsheet.
      </p>
    </div>
  );
}

function platformMod(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl';
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

function humanTokens(tokens: { input?: number; output?: number; total?: number } | undefined): string {
  if (!tokens) return '0 tok';
  const t = tokens.total ?? (tokens.input ?? 0) + (tokens.output ?? 0);
  if (t >= 10_000) return `${(t / 1_000).toFixed(1)}k tok`;
  if (t >= 1_000) return `${(t / 1_000).toFixed(2)}k tok`;
  return `${t} tok`;
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
