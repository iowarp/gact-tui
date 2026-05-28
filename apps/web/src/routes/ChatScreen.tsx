import { createSignal, For } from 'solid-js';
import { Sidebar, type SidebarSession } from '../components/Sidebar.js';
import { Transcript, type TranscriptDensity } from '../components/Transcript.js';
import { Composer } from '../components/Composer.js';
import { PermissionCard } from '../components/PermissionCard.js';
import { fixturesForDemo } from '../fixtures/demo.js';
import type { BackendHandle } from '../App.js';
import './chat.css';

export interface ChatScreenProps {
  backend: BackendHandle;
}

export function ChatScreen(props: ChatScreenProps) {
  const fixtures = fixturesForDemo();
  const url = new URL(window.location.href);
  const fixtureName = url.searchParams.get('fixture') ?? 'normal';

  // empty-sidebar fixture overrides the session list and skips the transcript
  // pre-fill so screenshots show the genuine "no sessions yet" empty state.
  const isEmpty = fixtureName === 'empty-sidebar';
  const initialSessions: SidebarSession[] = isEmpty ? [] : fixtures.sessions;
  const initialMessages = isEmpty
    ? []
    : (fixtures.byName[fixtureName] ?? fixtures.byName.normal!);

  const [sessions] = createSignal<SidebarSession[]>(initialSessions);
  const [activeId, setActiveId] = createSignal<string>(initialSessions[0]?.id ?? '');
  const [density, setDensity] = createSignal<TranscriptDensity>('normal');

  if (fixtureName === 'verbose') setDensity('verbose');
  if (fixtureName === 'summary') setDensity('summary');

  const [messages, _setMessages] = createSignal(initialMessages);

  const pendingPermission = () =>
    fixtureName === 'permission' ? fixtures.permission : null;

  return (
    <div class="chat" data-testid="chat-screen">
      <header class="chat__topbar">
        <div class="chat__crumbs">
          <span class="chat__brand">CLIO</span>
          <span class="chat__crumb-sep">▸</span>
          <span class="chat__crumb">gact-tui</span>
          <span class="chat__crumb-sep">▸</span>
          <span class="chat__crumb">{sessions().find((s) => s.id === activeId())?.title ?? '—'}</span>
        </div>
        <div class="chat__topbar-right">
          <span class="chip">{props.backend.url}</span>
          <span
            class={'chip ' + (density() === 'verbose' ? 'chip--warn' : 'chip--ok')}
            data-testid="density-chip"
          >
            density · {density()}
          </span>
        </div>
      </header>

      <div class="chat__body">
        <Sidebar
          sessions={sessions()}
          activeId={activeId()}
          onSelect={(id) => setActiveId(id)}
        />
        <div class="chat__main">
          <div class="chat__pane" data-testid="transcript-pane">
            <For each={[pendingPermission()].filter(Boolean)}>
              {(p) => <PermissionCard request={p!} />}
            </For>
            <Transcript messages={messages()} density={density()} />
          </div>
          <Composer />
        </div>
      </div>
    </div>
  );
}
