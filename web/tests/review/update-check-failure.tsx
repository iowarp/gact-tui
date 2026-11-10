/**
 * Browser review of the bell and the agent line when a desktop update check
 * cannot finish. Real components, simulated native metadata; no software is
 * installed.
 *
 * `?case=unpublished-repair` is the reported build: app 0.9.6-0 (beta
 * channel), bundled runtime 0.9.5.1, and no published v0.9.6-beta.0 to restore
 * the runtime from. `?case=still-publishing` is a newer beta whose update
 * manifest is not uploaded yet. `?case=available` is a real newer beta.
 */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { ClioAttentionCenter } from '../../src/components/clio/attention-center';
import { NavigationAgentMenu } from '../../src/components/clio/navigation-agent-menu';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { NotificationPreferencesProvider } from '../../src/providers/notification-preferences-provider';
import { SidebarProvider } from '../../src/components/ui/sidebar';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { checkForDesktopUpdate } from '../../src/tauri/desktop-updater';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const scenario = params.get('case') ?? 'unpublished-repair';
const app = '0.9.6-0';
const runtime = scenario === 'unpublished-repair' ? '0.9.5.1' : '0.9.6b0';
const RELEASE_NOT_FOUND = 'Could not fetch a valid release JSON from the remote';
const release = (tag: string, prerelease: boolean) => ({
  tag_name: tag,
  draft: false,
  prerelease,
  published_at: '2026-11-10T00:00:00Z',
  assets: [{ name: 'latest-lite.json' }],
});
const releases =
  scenario === 'unpublished-repair'
    ? [release('v0.9.5.1', false), release('v0.9.5-beta.8', true)]
    : [release('v0.9.6-beta.1', true), release('v0.9.5.1', false)];

localStorage.setItem('clio.update-channel', 'beta');
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('https://api.github.com/'))
    return new Response(JSON.stringify(releases), {
      headers: { 'content-type': 'application/json' },
    });
  return realFetch(input, init);
};

Object.assign(window, { __CLIO_DESKTOP__: { version: 'review' } });
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  configurable: true,
  value: {
    transformCallback: () => 0,
    unregisterCallback: () => undefined,
    invoke: async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case 'plugin:app|version':
          return app;
        case 'has_managed_runtime':
          return true;
        case 'managed_runtime_update_mode':
          return 'bundled';
        case 'get_backend':
          return {
            url: 'http://owned-runtime.invalid',
            bearer_token: 'fixture-only',
            status: { kind: 'ready' },
          };
        case 'check_release_update': {
          const tag = String(args?.['tag']);
          // The native lookup reads `releases/download/<tag>/latest-lite.json`.
          if (tag === 'v0.9.6-beta.0' || scenario === 'still-publishing') throw RELEASE_NOT_FOUND;
          if (scenario === 'available' && tag === 'v0.9.6-beta.1')
            return {
              rid: 42,
              currentVersion: app,
              version: '0.9.6-1',
              body: 'Faster desktop install.',
              rawJson: {},
            };
          return null;
        }
        case 'gact_http': {
          const url = String((args?.['req'] as { url?: string } | undefined)?.url);
          if (!url.endsWith('/v1/capabilities'))
            return { status: 404, status_text: 'Not Found', headers: {}, body: '{}' };
          return {
            status: 200,
            status_text: 'OK',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              service: { name: 'clio-agent-gact', version: runtime },
              gact_versions: ['3'],
              replay: { supported: false },
              capabilities: {},
              model_catalog: {
                source: 'unavailable',
                observed_at: new Date().toISOString(),
                stale: false,
              },
            }),
          };
        }
        case 'plugin:resources|close':
          return;
        default:
          throw new Error(`Unexpected fixture native command: ${command}`);
      }
    },
  },
});

function Review() {
  useEffect(() => {
    // The desktop runs this check at startup; the review starts it once.
    void checkForDesktopUpdate().catch(() => undefined);
  }, []);
  return (
    <ForcedTheme theme={params.get('theme') === 'light' ? 'light' : 'dark'}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <ArchiveConnectionProvider>
            <NotificationPreferencesProvider>
              <TooltipProvider>
                <SidebarProvider>
                  <main className="min-h-dvh w-full bg-background p-6 text-foreground">
                    <p className="mb-4 text-xs text-muted-foreground">
                      Interface review · {scenario} · app {app}, runtime {runtime}. Simulated native
                      update metadata; nothing is installed.
                    </p>
                    <div className="flex w-[280px] items-center gap-2" data-testid="header">
                      <div className="min-w-0 flex-1">
                        <NavigationAgentMenu
                          connectionAvailabilities={{}}
                          connections={[]}
                          currentPath="/"
                          endpoint="http://127.0.0.1:17800"
                          onConnect={() => undefined}
                        />
                      </div>
                      <ClioAttentionCenter activeSessionId="" attentions={{}} sessions={[]} />
                    </div>
                  </main>
                </SidebarProvider>
              </TooltipProvider>
            </NotificationPreferencesProvider>
          </ArchiveConnectionProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ForcedTheme>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
