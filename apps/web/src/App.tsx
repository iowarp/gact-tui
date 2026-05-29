import { createSignal, Match, Switch } from 'solid-js';
import { ConnectScreen } from './routes/ConnectScreen.js';
import { ChatScreen } from './routes/ChatScreen.js';
import { SplashScreen } from './routes/SplashScreen.js';
import { SettingsShell, type SettingsSection } from './routes/SettingsShell.js';
import { AddRemoteBackend } from './routes/AddRemoteBackend.js';
import type { Capabilities } from '@clio/core';
import { inTauri } from './tauri.js';
import {
  BackendRegistryProvider,
  createBackendRegistry,
  type BackendRegistry,
} from './registry.js';
import { ToastProvider } from './components/Toast.js';

export interface BackendHandle {
  url: string;
  bearerToken: string;
  capabilities: Capabilities;
}

type Route =
  | { name: 'splash' }
  | { name: 'connect' }
  | { name: 'chat'; backend: BackendHandle }
  | { name: 'settings'; section?: SettingsSection }
  | { name: 'add-remote' };

export function App() {
  const registry = createBackendRegistry();

  // Default route is the Splash. Inside Tauri it polls the Rust supervisor
  // until the bundled sidecar reports ready; in a pure browser it auto-
  // probes http://localhost:7777/v1/capabilities. The connect form only
  // appears as a fallback when the pure-web probe fails — it is NEVER the
  // default route. (Per the product correction in
  // memory/feedback_clio_desktop_sidecar.md and Wave 0 in apps/PLAN.md.)
  const [route, setRoute] = createSignal<Route>({ name: 'splash' });

  // Test/visual hook: `?route=chat` jumps directly into the chat shell
  // with a synthesized handle so Playwright can capture screenshots
  // without a live backend.
  const url = new URL(window.location.href);
  const routeParam = url.searchParams.get('route');
  if (routeParam === 'chat') {
    setRoute({
      name: 'chat',
      backend: {
        url: url.searchParams.get('backend') ?? 'http://localhost:7777',
        bearerToken: '',
        capabilities: synthCapabilities(),
      },
    });
  } else if (routeParam === 'connect') {
    setRoute({ name: 'connect' });
  } else if (routeParam === 'settings-backends') {
    setRoute({ name: 'settings' });
    seedFixtureBackends(registry);
  } else if (routeParam === 'add-remote') {
    setRoute({ name: 'add-remote' });
    seedFixtureBackends(registry);
  } else if (routeParam === 'splash') {
    setRoute({ name: 'splash' });
  }

  if (typeof document !== 'undefined') {
    document.body.dataset.shell = inTauri() ? 'tauri' : 'web';
  }

  function onSplashReady(b: BackendHandle) {
    // Register the resolved backend with the registry so the picker
    // shows it immediately. Use a stable id so duplicate boots don't
    // pollute the list.
    registry.add({
      id: 'clio:local',
      label: inTauri() ? 'Local clio' : 'localhost:7777',
      url: b.url,
      bearerToken: b.bearerToken,
      kind: inTauri() ? 'local-sidecar' : 'http',
      capabilities: b.capabilities,
    });
    registry.select('clio:local');
    setRoute({ name: 'chat', backend: b });
  }

  return (
    <BackendRegistryProvider registry={registry}>
      <ToastProvider>
      <Switch>
        <Match when={route().name === 'splash'}>
          <SplashScreen
            onReady={onSplashReady}
            onWebFallbackNeeded={() => setRoute({ name: 'connect' })}
          />
        </Match>
        <Match when={route().name === 'connect'}>
          <ConnectScreen
            onConnected={(b) => {
              const id = 'manual:' + Math.random().toString(36).slice(2, 8);
              registry.add({
                id,
                label: hostLabel(b.url),
                url: b.url,
                bearerToken: b.bearerToken,
                kind: 'http',
                capabilities: b.capabilities,
              });
              // Mark the freshly-added backend as the current one so
              // the BackendPicker in the composer shows its label
              // instead of "no backend".
              registry.select(id);
              setRoute({ name: 'chat', backend: b });
            }}
          />
        </Match>
        <Match when={route().name === 'chat'}>
          {(() => {
            const r = route();
            if (r.name !== 'chat') return null;
            return (
              <ChatScreen
                backend={r.backend}
                onOpenSettings={(section) =>
                  setRoute({ name: 'settings', ...(section ? { section } : {}) })
                }
                onAddRemote={() => setRoute({ name: 'add-remote' })}
              />
            );
          })()}
        </Match>
        <Match when={route().name === 'settings'}>
          {(() => {
            const r = route();
            if (r.name !== 'settings') return null;
            return (
              <SettingsShell
                onAddRemote={() => setRoute({ name: 'add-remote' })}
                onBack={() => backToChat(registry, setRoute)}
                {...(r.section ? { initial: r.section } : {})}
              />
            );
          })()}
        </Match>
        <Match when={route().name === 'add-remote'}>
          <AddRemoteBackend
            onSaved={() => backToChat(registry, setRoute)}
            onCancel={() => setRoute({ name: 'settings' })}
          />
        </Match>
      </Switch>
      </ToastProvider>
    </BackendRegistryProvider>
  );
}

function backToChat(
  registry: BackendRegistry,
  setRoute: (r: Route) => void,
) {
  const cur = registry.current();
  if (!cur) {
    setRoute({ name: 'splash' });
    return;
  }
  setRoute({
    name: 'chat',
    backend: {
      url: cur.url,
      bearerToken: cur.bearerToken,
      capabilities: cur.capabilities ?? synthCapabilities(),
    },
  });
}

function hostLabel(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

function synthCapabilities(): Capabilities {
  return {
    contract_version: '0.2',
    backend: {
      name: 'fixture',
      version: '0.0.0',
      vendor: 'gact-tui',
    },
    capabilities: {
      workspaces: true,
      sessions: true,
      subagents: true,
      mcp: true,
      files: true,
      diffs: true,
      permissions: true,
      providers: true,
      commands: true,
      metrics: true,
      session_branching: true,
      session_export: true,
      cost_tracking: true,
      thinking_blocks: true,
      search_messages: true,
      agent_routing: true,
      memory: true,
      structured_errors: true,
      integration_health: true,
      tool_telemetry: true,
    },
    transports: {
      events_sse: true,
      events_websocket: false,
    },
    auth: {
      schemes: ['trust_socket'],
      current: 'trust_socket',
    },
    extensions: [],
  };
}

/**
 * Visual-regression hook for the settings + add-remote screenshots —
 * seeds the registry with a couple of fixtures so the screenshot has
 * something to render. Only fires when `?route=` opens those routes
 * directly.
 */
function seedFixtureBackends(registry: BackendRegistry) {
  if (registry.state().backends.length > 0) return;
  registry.add({
    id: 'clio:local',
    label: 'Local clio',
    url: 'http://127.0.0.1:17800',
    bearerToken: 'demo-token',
    kind: 'local-sidecar',
    capabilities: synthCapabilities(),
  });
  registry.add({
    id: 'alcf:polaris',
    label: 'ALCF · polaris',
    url: 'http://polaris.alcf.anl.gov:8100',
    bearerToken: '••••',
    kind: 'ssh-tunnel',
    capabilities: synthCapabilities(),
    ssh: {
      host: 'polaris.alcf.anl.gov',
      user: 'jaime',
      keyPath: '~/.ssh/id_ed25519',
    },
  });
  registry.add({
    id: 'remote:flagship',
    label: 'Flagship · staging',
    url: 'https://clio-staging.example.com',
    bearerToken: '••••',
    kind: 'http',
    lastError: 'connect ECONNREFUSED 1.2.3.4:443',
  });
  registry.select('clio:local');
}
