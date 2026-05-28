import { createMemo, createSignal, For, Show } from 'solid-js';
import { Sidebar, type SidebarSession } from '../components/Sidebar.js';
import { Transcript, type TranscriptDensity } from '../components/Transcript.js';
import { Composer } from '../components/Composer.js';
import { PermissionCard } from '../components/PermissionCard.js';
import { fixturesForDemo } from '../fixtures/demo.js';
import type { BackendHandle } from '../App.js';
import { createLiveSessions, createLiveTranscript } from '../live.js';
import type { PermissionScope, Message, PermissionRequest } from '@clio/core';
import './chat.css';

export interface ChatScreenProps {
  backend: BackendHandle;
}

export function ChatScreen(props: ChatScreenProps) {
  const url = new URL(window.location.href);
  const fixtureName = url.searchParams.get('fixture');

  if (fixtureName) {
    // Fixture-driven path keeps the visual regression set deterministic
    // — never touches the network, never opens an SSE stream.
    return <FixtureDriven backend={props.backend} fixture={fixtureName} />;
  }
  return <LiveDriven backend={props.backend} />;
}

/* -------------------------------------------------------------- */
/* Fixture-driven (kept identical to harness behavior for proofs) */
/* -------------------------------------------------------------- */

function FixtureDriven(props: { backend: BackendHandle; fixture: string }) {
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

  return (
    <ChatLayout
      backendUrl={props.backend.url}
      sessions={sessions()}
      activeId={activeId()}
      onSelect={setActiveId}
      density={density()}
      messages={messages()}
      pendingPermission={pendingPermission()}
      composerDisabled={!activeId()}
    />
  );
}

/* -------------------------------------------------------------- */
/* Live-driven (real backend, SSE-streamed transcript)            */
/* -------------------------------------------------------------- */

function LiveDriven(props: { backend: BackendHandle }) {
  const live = createLiveSessions({
    url: props.backend.url,
    bearerToken: props.backend.bearerToken,
  });

  const sessions = createMemo<SidebarSession[]>(() => live.sessions() ?? []);
  const [activeId, setActiveId] = createSignal<string>('');
  // Auto-select the first session once the list lands.
  createMemo(() => {
    const list = sessions();
    if (!activeId() && list.length > 0) setActiveId(list[0]!.id);
  });

  const [density, setDensity] = createSignal<TranscriptDensity>('normal');
  void setDensity; // density toggle keybinding lands in Wave 4.

  const transcript = createLiveTranscript(live.client, activeId);

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
      // Surface the failure in the console; the SSE feed will replay
      // the request if the backend re-emits it.
      console.error('resolvePermission failed', e);
    }
  }

  return (
    <ChatLayout
      backendUrl={props.backend.url}
      sessions={sessions()}
      activeId={activeId()}
      onSelect={setActiveId}
      density={density()}
      messages={transcript.messages()}
      pendingPermission={transcript.pendingPermission()}
      onSubmit={sendUserMessage}
      onPermissionDecide={decidePermission}
      composerDisabled={false}
      sseStatus={transcript.status()}
    />
  );
}

/* -------------------------------------------------------------- */
/* Layout (shared by both modes)                                  */
/* -------------------------------------------------------------- */

function ChatLayout(props: {
  backendUrl: string;
  sessions: SidebarSession[];
  activeId: string;
  onSelect: (id: string) => void;
  density: TranscriptDensity;
  messages: Message[];
  pendingPermission: PermissionRequest | null;
  onSubmit?: (text: string) => Promise<void> | void;
  onPermissionDecide?: (decision: 'approve' | 'deny', scope?: PermissionScope) => void;
  composerDisabled: boolean;
  sseStatus?: 'connecting' | 'open' | 'closed' | 'error';
}) {
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
          <span
            class={'chip ' + (props.density === 'verbose' ? 'chip--warn' : 'chip--ok')}
            data-testid="density-chip"
          >
            density · {props.density}
          </span>
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
            <Transcript messages={props.messages} density={props.density} />
          </div>
          <Composer
            backendLabel={hostFromUrl(props.backendUrl)}
            disabled={props.composerDisabled}
            onSubmit={props.onSubmit}
          />
        </div>
      </div>
    </div>
  );
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
