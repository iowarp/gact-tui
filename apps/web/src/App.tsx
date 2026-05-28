import { createSignal, Match, Switch } from 'solid-js';
import { ConnectScreen } from './routes/ConnectScreen.js';
import { ChatScreen } from './routes/ChatScreen.js';
import type { Capabilities } from '@clio/core';

export interface BackendHandle {
  url: string;
  bearerToken: string;
  capabilities: Capabilities;
}

type Route = { name: 'connect' } | { name: 'chat'; backend: BackendHandle };

export function App() {
  // PRODUCT NOTE (2026-05-27): the default route here is `connect` — that is
  // WRONG long-term. CLIO Desktop must bundle clio-agent via Tauri sidecar,
  // auto-start it on launch, and boot the user straight into the chat shell.
  // The connect form belongs at /settings/backends/add-remote for the
  // advanced "add another backend" (federation) case only. Tracked as Wave 0
  // in apps/PLAN.md; do it before any other PLAN.md item.
  const [route, setRoute] = createSignal<Route>({ name: 'connect' });

  // Test/visual hook: ?route=chat lands directly on the chat shell with a
  // mocked backend handle. Keeps the harness deterministic for screenshots
  // before the live wire is plumbed.
  const url = new URL(window.location.href);
  if (url.searchParams.get('route') === 'chat') {
    setRoute({
      name: 'chat',
      backend: {
        url: url.searchParams.get('backend') ?? 'http://localhost:7777',
        bearerToken: '',
        capabilities: {
          contract_version: '0.2',
          sessions: true,
          messages: true,
          sse: true,
          diffs: true,
          tools: true,
          permissions: true,
          agents: true,
          mcp: true,
          metrics: true,
        },
      },
    });
  }

  return (
    <Switch>
      <Match when={route().name === 'connect'}>
        <ConnectScreen onConnected={(b) => setRoute({ name: 'chat', backend: b })} />
      </Match>
      <Match when={route().name === 'chat'}>
        {(() => {
          const r = route();
          if (r.name !== 'chat') return null;
          return <ChatScreen backend={r.backend} />;
        })()}
      </Match>
    </Switch>
  );
}
