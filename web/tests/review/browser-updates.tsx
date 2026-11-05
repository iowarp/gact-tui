/** Real browser update control with synthetic versions. No live service or installer is used. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { SystemVersionStatus } from '../../src/components/clio/navigation-version-status';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { createRepository } from '../../src/lib/connection';
import '../../src/index.css';

localStorage.setItem('clio.update-channel', 'stable');
const repository = Object.assign(createRepository({ endpoint: 'https://archive.invalid' }), {
  capabilities: async () => ({
    service: { name: 'clio-agent-gact', version: '0.9.5b8' },
    gact_versions: ['3'],
    a2ui_versions: [],
    replay: { supported: false },
    capabilities: {},
    degradations: [],
    model_catalog: { source: 'unavailable', observed_at: '', stale: false },
  }),
  latestRelease: async () => ({
    version: '0.9.5.1',
    source: 'https://github.com/iowarp/clio-agent/releases/tag/v0.9.5.1',
    checked_at: new Date().toISOString(),
    degradation: null,
  }),
});

createRoot(document.getElementById('root')!).render(
  <ForcedTheme theme="light">
    <QueryClientProvider client={new QueryClient()}>
      <ArchiveConnectionProvider>
        <RepositoryOverride value={repository}>
          <main className="min-h-dvh bg-background p-8 text-foreground">
            <p className="mb-8 text-xs text-muted-foreground">
              Browser update review · Synthetic version data. No installation or model calls.
            </p>
            <SystemVersionStatus />
          </main>
        </RepositoryOverride>
      </ArchiveConnectionProvider>
    </QueryClientProvider>
  </ForcedTheme>,
);
