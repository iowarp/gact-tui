/**
 * Root application component: owns the backend registry, resolves the
 * initial route (splash/connect/chat/settings), and switches between the
 * top-level screens. Exports `App` and re-exports `BackendHandle`.
 */
import { createEffect, createSignal, Match, onCleanup, Show, Switch } from 'solid-js';
import { brand } from '@brand';
import { ConnectScreen } from './routes/ConnectScreen.js';
import { ChatScreen } from './routes/ChatScreen.js';
import { SplashScreen } from './routes/SplashScreen.js';
import { SettingsShell } from './routes/SettingsShell.js';
import { AddRemoteBackend } from './routes/AddRemoteBackend.js';
import { inTauri } from './tauri.js';
import {
  BackendRegistryProvider,
  createBackendRegistry,
} from './registry.js';
import { ToastProvider, useToast } from './components/Toast.js';
import { createUpdateCheck } from './updateCheck.js';
import { checkForDesktopUpdate, relaunchApp } from './tauri_update.js';
import { hostLabel, seedFixtureBackends } from './appBootstrap.js';
import {
  backendHandleFromEntry,
  initialRouteFromUrl,
  routeBackToChat,
  type BackendHandle,
  type Route,
} from './AppRouteModel.js';

export type { BackendHandle } from './AppRouteModel.js';

/**
 * Watches the build marker for a newer deploy and, when one lands, raises a
 * single persistent toast offering a hard reload. Lives inside ToastProvider
 * so it can reach `useToast`. Renders nothing itself.
 */
function UpdateNotifier() {
  const toast = useToast();

  // Desktop (Tauri) native auto-update: on launch, ask the signed
  // GitHub-releases marker whether a newer build exists. If so, raise a
  // persistent toast that downloads + installs the signed bundle and relaunches
  // on the user's confirmation. Gated behind inTauri() inside the helper, so the
  // pure-web build never imports the updater plugin. This is distinct from the
  // web SPA refresh flow below (which swaps a hashed bundle, not a binary).
  if (inTauri()) {
    void (async () => {
      const update = await checkForDesktopUpdate();
      if (!update) return;
      toast.push({
        title: `Desktop update ${update.version} available — Install & restart`,
        tone: 'info',
        icon: 'sparkle',
        duration: 0,
        testId: 'desktop-update-available-toast',
        action: {
          label: 'Install',
          onClick: () => {
            void (async () => {
              try {
                await update.downloadAndInstall();
                await relaunchApp();
              } catch {
                toast.push({
                  title: 'Desktop update failed — try again later',
                  tone: 'error',
                  duration: 6000,
                });
              }
            })();
          },
        },
      });
    })();
  }

  // Web SPA self-update: watch the build marker for a newer deploy.
  const updates = createUpdateCheck();
  onCleanup(() => updates.stop());

  let raised = false;
  createEffect(() => {
    if (!updates.updateAvailable() || raised) return;
    raised = true;
    const version = updates.newVersion() ?? '';
    toast.push({
      title: `New version ${version} available — Refresh`,
      tone: 'info',
      icon: 'sparkle',
      // Persistent: stays until the user acts (no auto-dismiss).
      duration: 0,
      testId: 'update-available-toast',
      action: {
        label: 'Refresh',
        onClick: () => {
          // Hard reload to drop the cached bundle and pull the new build.
          // The deprecated `forceReload` arg is ignored by modern engines but
          // remains the canonical "bypass cache" intent; a plain reload also
          // works because the new index.html references hashed asset names.
          (window.location.reload as (forceReload?: boolean) => void)(true);
        },
      },
    });
  });

  return null;
}

export function App() {
  const registry = createBackendRegistry();

  // Default route is the Splash. Inside Tauri it polls the Rust supervisor
  // until the bundled sidecar reports ready; in a pure browser it auto-
  // probes http://localhost:17800/v1/capabilities. The connect form only
  // appears as a fallback when the pure-web probe fails — it is NEVER the
  // default route. (Per the product correction in
  // memory/feedback_clio_desktop_sidecar.md and Wave 0 in apps/PLAN.md.)
  const initialRoute = initialRouteFromUrl(window.location.href);
  const [route, setRoute] = createSignal<Route>(initialRoute.route);
  if (initialRoute.seedFixtureBackends) {
    seedFixtureBackends(registry);
  }

  createEffect(() => {
    const cur = registry.current();
    const r = route();
    if (r.name !== 'chat' || !cur) return;
    if (r.backend.url === cur.url && r.backend.bearerToken === cur.bearerToken) {
      return;
    }
    setRoute({
      name: 'chat',
      backend: backendHandleFromEntry(cur),
    });
  });

  if (typeof document !== 'undefined') {
    document.body.dataset.shell = inTauri() ? 'tauri' : 'web';
  }

  function onSplashReady(b: BackendHandle) {
    const existing = registry
      .state()
      .backends.find(
        (backend) => backend.url === b.url && backend.bearerToken === b.bearerToken,
      );
    if (existing) {
      registry.update(existing.id, { capabilities: b.capabilities, lastError: undefined });
      registry.select(existing.id);
    } else {
      // Register the resolved backend with the registry so the picker
      // shows it immediately. Use a stable id for the local sidecar/default.
      registry.add({
        id: 'clio:local',
        label: inTauri() ? `Local ${brand.name}` : hostLabel(b.url),
        url: b.url,
        bearerToken: b.bearerToken,
        kind: inTauri() ? 'local-sidecar' : 'http',
        capabilities: b.capabilities,
      });
      registry.select('clio:local');
    }
    setRoute({ name: 'chat', backend: b });
  }

  return (
    <BackendRegistryProvider registry={registry}>
      <ToastProvider>
        <UpdateNotifier />
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
                <Show when={r.backend} keyed>
                  {(backend) => (
                    <ChatScreen
                      backend={backend}
                      onOpenSettings={(section, context) =>
                        setRoute({
                          name: 'settings',
                          ...(section ? { section } : {}),
                          ...(context ? { context } : {}),
                        })
                      }
                      onAddRemote={() => setRoute({ name: 'add-remote' })}
                    />
                  )}
                </Show>
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
                  onBack={() => setRoute(routeBackToChat(registry))}
                  {...(r.section ? { initial: r.section } : {})}
                  {...(r.context ? { context: r.context } : {})}
                />
              );
            })()}
          </Match>
          <Match when={route().name === 'add-remote'}>
            <AddRemoteBackend
              onSaved={() => setRoute(routeBackToChat(registry))}
              onCancel={() => setRoute({ name: 'settings' })}
            />
          </Match>
        </Switch>
      </ToastProvider>
    </BackendRegistryProvider>
  );
}
