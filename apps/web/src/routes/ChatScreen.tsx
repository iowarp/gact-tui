import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Sidebar, type SidebarSession } from '../components/Sidebar.js';
import { Transcript, type TranscriptDensity } from '../components/Transcript.js';
import { Composer } from '../components/Composer.js';
import { PermissionCard } from '../components/PermissionCard.js';
import { BackendPicker } from '../components/BackendPicker.js';
import { DiffPane } from '../components/DiffPane.js';
import {
  DEFAULT_COMMANDS,
  SlashPalette,
  type SlashCommand,
} from '../components/SlashPalette.js';
import { fixturesForDemo } from '../fixtures/demo.js';
import type { BackendHandle } from '../App.js';
import { createLiveSessions, createLiveTranscript } from '../live.js';
import type {
  FileDiff,
  PermissionScope,
  Message,
  PermissionRequest,
} from '@clio/core';
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

/* -------------------------------------------------------------- */
/* Fixture-driven (kept identical to harness behavior for proofs) */
/* -------------------------------------------------------------- */

function FixtureDriven(props: {
  backend: BackendHandle;
  fixture: string;
  onOpenSettings?: () => void;
  onAddRemote?: () => void;
}) {
  const fixtures = fixturesForDemo();
  const isEmpty = props.fixture === 'empty-sidebar';
  const initialSessions: SidebarSession[] = isEmpty ? [] : fixtures.sessions;
  const initialMessages = isEmpty
    ? []
    : (fixtures.byName[props.fixture] ?? fixtures.byName.normal!);

  const [sessions] = createSignal<SidebarSession[]>(initialSessions);
  const [activeId, setActiveId] = createSignal<string>(initialSessions[0]?.id ?? '');
  const [density, setDensity] = createSignal<TranscriptDensity>('normal');

  if (props.fixture === 'verbose') setDensity('verbose');
  if (props.fixture === 'summary') setDensity('summary');

  const [messages] = createSignal(initialMessages);

  const pendingPermission = (): PermissionRequest | null =>
    props.fixture === 'permission' ? fixtures.permission : null;

  // Visual-proof hooks: `?open=diff|palette` pre-opens the matching
  // overlay so Playwright doesn't have to click around.
  const url = new URL(window.location.href);
  const openHint = url.searchParams.get('open');

  // Mock streaming when fixture says so.
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
    />
  );
}

/* -------------------------------------------------------------- */
/* Live-driven (real backend, SSE-streamed transcript)            */
/* -------------------------------------------------------------- */

function LiveDriven(props: {
  backend: BackendHandle;
  onOpenSettings?: () => void;
  onAddRemote?: () => void;
}) {
  const live = createLiveSessions({
    url: props.backend.url,
    bearerToken: props.backend.bearerToken,
  });

  const sessions = createMemo<SidebarSession[]>(() => live.sessions() ?? []);
  const [activeId, setActiveId] = createSignal<string>('');
  createMemo(() => {
    const list = sessions();
    if (!activeId() && list.length > 0) setActiveId(list[0]!.id);
  });

  const [density, setDensity] = createSignal<TranscriptDensity>('normal');
  const [streaming, setStreaming] = createSignal(false);

  const transcript = createLiveTranscript(live.client, activeId);

  // Streaming is "active session in running state" — derive from the
  // sidebar entry once we have it.
  createMemo(() => {
    const cur = sessions().find((s) => s.id === activeId());
    setStreaming(cur?.status === 'running');
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

  return (
    <ChatLayout
      backendUrl={props.backend.url}
      sessions={sessions()}
      activeId={activeId()}
      onSelect={setActiveId}
      density={density()}
      setDensity={setDensity}
      messages={transcript.messages()}
      pendingPermission={transcript.pendingPermission()}
      onSubmit={sendUserMessage}
      onPermissionDecide={decidePermission}
      onStop={stopRun}
      composerDisabled={false}
      streaming={streaming()}
      sseStatus={transcript.status()}
      onOpenSettings={props.onOpenSettings}
      onAddRemote={props.onAddRemote}
    />
  );
}

/* -------------------------------------------------------------- */
/* Layout (shared by both modes)                                  */
/* -------------------------------------------------------------- */

interface ChatLayoutProps {
  backendUrl: string;
  sessions: SidebarSession[];
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
  /** Pre-open hint from URL (visual proofs): "diff" | "palette" | null. */
  preOpen?: string | null;
  onOpenSettings?: () => void;
  onAddRemote?: () => void;
}

function ChatLayout(props: ChatLayoutProps) {
  const [activeDiff, setActiveDiff] = createSignal<FileDiff | null>(null);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [paletteQuery, setPaletteQuery] = createSignal('');

  // Pre-open from URL hint (visual proofs only).
  onMount(() => {
    if (props.preOpen === 'diff') {
      const firstDiff = firstFileDiff(props.messages);
      if (firstDiff) setActiveDiff(firstDiff);
    } else if (props.preOpen === 'palette') {
      setPaletteOpen(true);
    }
  });

  // Global keybindings — Ctrl+O density cycle, Ctrl+K / Cmd+K palette.
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing inside a field, except for the palette modifier.
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

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
      if (e.key === 'Escape' && paletteOpen()) {
        setPaletteOpen(false);
      }
      void inField;
    };
    window.addEventListener('keydown', onKey, true);
    onCleanup(() => window.removeEventListener('keydown', onKey, true));
  });

  function handlePick(cmd: SlashCommand) {
    setPaletteOpen(false);
    if (cmd.trigger === '/settings') props.onOpenSettings?.();
    // Other commands aren't wired to real backend operations yet —
    // closing the palette is the visible effect for v0.9.
  }

  return (
    <div class="chat" data-testid="chat-screen">
      <header class="chat__topbar">
        <div class="chat__crumbs">
          <span class="chat__brand">CLIO</span>
          <span class="chat__crumb-sep">▸</span>
          <span class="chat__crumb">gact-tui</span>
          <span class="chat__crumb-sep">▸</span>
          <span class="chat__crumb">
            {props.sessions.find((s) => s.id === props.activeId)?.title ?? '—'}
          </span>
        </div>
        <div class="chat__topbar-right">
          <span class="chip">{props.backendUrl}</span>
          <Show when={props.sseStatus}>
            <span
              class={'chip ' + sseChipClass(props.sseStatus!)}
              data-testid="sse-status-chip"
            >
              sse · {props.sseStatus}
            </span>
          </Show>
          <button
            type="button"
            class={'chip chip--pressable ' + (props.density === 'verbose' ? 'chip--warn' : 'chip--ok')}
            data-testid="density-chip"
            title="Ctrl+O cycles density"
            onClick={() => cycleDensity(props.density, props.setDensity)}
          >
            density · {props.density}
          </button>
        </div>
      </header>

      <div class="chat__body">
        <Sidebar
          sessions={props.sessions}
          activeId={props.activeId}
          onSelect={props.onSelect}
        />
        <div class="chat__main">
          <div class="chat__pane" data-testid="transcript-pane">
            <For each={[props.pendingPermission].filter(Boolean)}>
              {(p) => (
                <PermissionCard request={p!} onDecide={props.onPermissionDecide} />
              )}
            </For>
            <Transcript
              messages={props.messages}
              density={props.density}
              onOpenDiff={(d) => setActiveDiff(d)}
            />
            <Show when={activeDiff()}>
              <DiffPane diff={activeDiff()!} onClose={() => setActiveDiff(null)} />
            </Show>
          </div>
          <Composer
            backendLabel={hostFromUrl(props.backendUrl)}
            disabled={props.composerDisabled}
            streaming={props.streaming}
            onStop={props.onStop}
            onSubmit={props.onSubmit}
            backendSlot={
              <BackendPicker
                onOpenSettings={props.onOpenSettings}
                onAddRemote={props.onAddRemote}
              />
            }
          />
        </div>
      </div>

      <SlashPalette
        open={paletteOpen()}
        query={paletteQuery()}
        commands={DEFAULT_COMMANDS}
        onQueryChange={setPaletteQuery}
        onPick={handlePick}
        onClose={() => setPaletteOpen(false)}
      />
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

function sseChipClass(s: 'connecting' | 'open' | 'closed' | 'error'): string {
  switch (s) {
    case 'open':
      return 'chip--ok';
    case 'connecting':
      return '';
    case 'error':
      return 'chip--err';
    case 'closed':
    default:
      return 'chip--warn';
  }
}

function hostFromUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return parsed.host;
  } catch {
    return u;
  }
}
