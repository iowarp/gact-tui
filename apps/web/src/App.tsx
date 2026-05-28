import { createSignal, Match, Switch } from 'solid-js';
import { ConnectScreen } from './routes/ConnectScreen.js';
import { ChatScreen } from './routes/ChatScreen.js';
import { SplashScreen } from './routes/SplashScreen.js';
import type { Capabilities } from '@clio/core';
import { inTauri } from './tauri.js';

export interface BackendHandle {
  url: string;
  bearerToken: string;
  capabilities: Capabilities;
}

type Route =
  | { name: 'splash' }
  | { name: 'connect' }
  | { name: 'chat'; backend: BackendHandle };

export function App() {
  // Default route is the Splash. Inside Tauri it polls the Rust supervisor
  // until the bundled sidecar reports ready; in a pure browser it auto-
  // probes http://localhost:7777/v1/capabilities. The connect form only
  // appears as a fallback when the pure-web probe fails — it is NEVER the
  // default route. (Per the product correction in
  // memory/feedback_clio_desktop_sidecar.md and Wave 0 in apps/PLAN.md.)
  const [route, setRoute] = createSignal<Route>({ name: 'splash' });

  // Test/visual hook: `?route=chat` jumps directly into the chat shell
  // with a synthesized handle so Playwright can capture screenshots
  // without a live backend. Stays available for the legacy fixture set;
  // the new visual proofs drive against the real sidecar.
  const url = new URL(window.location.href);
  const routeParam = url.searchParams.get('route');
  if (routeParam === 'chat') {
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
  } else if (routeParam === 'connect') {
    // Legacy direct entry for visual regression coverage.
    setRoute({ name: 'connect' });
  } else if (routeParam === 'splash') {
    // Explicit splash entry — same as default, just no auto-skip below.
    setRoute({ name: 'splash' });
  }

  // The current `inTauri()` check is informational only — the SplashScreen
  // itself branches on it internally. We surface it here as a body class
  // so CSS can vary chrome (e.g. drag region, frameless titlebar) when
  // running inside Tauri vs. a regular browser tab.
  if (typeof document !== 'undefined') {
    document.body.dataset.shell = inTauri() ? 'tauri' : 'web';
  }

  return (
    <Switch>
      <Match when={route().name === 'splash'}>
        <SplashScreen
          onReady={(b) => setRoute({ name: 'chat', backend: b })}
          onWebFallbackNeeded={() => setRoute({ name: 'connect' })}
        />
      </Match>
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
