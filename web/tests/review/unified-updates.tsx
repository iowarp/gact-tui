/** Browser review of real update components with simulated native metadata. No software is installed. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { AppUpdateSettings } from '../../src/components/clio/settings-app-updates';
import { SystemVersionStatus } from '../../src/components/clio/navigation-version-status';
import { UpdateRestartRecovery } from '../../src/components/clio/update-restart-recovery';
import { UpdateRestartOverlay } from '../../src/components/clio/update-restart-overlay';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { SidebarProvider } from '../../src/components/ui/sidebar';
import { writePendingUpdateMarker, useUpdateFlowStore } from '../../src/store/update-flow-store';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'settings';
const restarted = view === 'recovery' || view === 'complete';
const current = restarted ? '0.9.5-7+2' : '0.9.5-7+1';
const runtime = view === 'complete' ? '0.9.5b7.post2' : '0.9.5b7.post1';
const callbacks = new Map<number, (data: unknown) => void>();
let callbackId = 0;
localStorage.setItem('clio.update-channel', 'stable');
if (view === 'recovery')
  writePendingUpdateMarker({ action: 'both', version: '0.9.5-beta.7.2', startedAt: Date.now() });
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  configurable: true,
  value: {
    transformCallback(callback: (data: unknown) => void) {
      callbacks.set(++callbackId, callback);
      return callbackId;
    },
    unregisterCallback(id: number) {
      callbacks.delete(id);
    },
    invoke: async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case 'plugin:app|version':
          return current;
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
        case 'plugin:updater|check':
          return {
            rid: 42,
            currentVersion: current,
            version: '0.9.5-7+2',
            body: 'Office compatibility and session storage recovery.',
            rawJson: {},
          };
        case 'gact_http':
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
        case 'plugin:updater|download': {
          const id = (args?.['onEvent'] as { id: number }).id;
          callbacks.get(id)?.({ event: 'Started', data: { contentLength: 100 } });
          callbacks.get(id)?.({ event: 'Progress', data: { chunkLength: 100 } });
          callbacks.get(id)?.({ event: 'Finished' });
          return;
        }
        case 'plugin:updater|install':
        case 'plugin:resources|close':
          return;
        case 'plugin:process|restart':
          location.assign('./unified-updates.html?view=complete');
          return;
        default:
          throw new Error(`Unexpected fixture native command: ${command}`);
      }
    },
  },
});

function Review() {
  const step = useUpdateFlowStore((state) => state.step);
  return (
    <ForcedTheme theme={params.get('theme') === 'dark' ? 'dark' : 'light'}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ArchiveConnectionProvider>
          <SidebarProvider>
            <main className="min-h-dvh w-full bg-background p-8 text-foreground">
              <div className="mx-auto max-w-2xl space-y-6">
                <p className="text-xs text-muted-foreground">
                  Interface review · Simulated native update metadata. No software is installed.
                </p>
                {view === 'status' ? <SystemVersionStatus /> : <AppUpdateSettings />}
                {restarted ? (
                  <>
                    <UpdateRestartRecovery />
                    <UpdateRestartOverlay />
                    <p data-testid="recovery-state">Recovery: {step}</p>
                  </>
                ) : null}
              </div>
            </main>
          </SidebarProvider>
        </ArchiveConnectionProvider>
      </QueryClientProvider>
    </ForcedTheme>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
