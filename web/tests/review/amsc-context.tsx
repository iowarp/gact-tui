import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { MemoryRouter } from 'react-router-dom';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { createRepository } from '../../src/lib/connection';
import { queryKeys } from '../../src/lib/query-keys';
import { buildModelOptions } from '../../src/lib/model-options';
import { ClioModelPicker } from '../../src/components/clio/model-picker';
import { Button } from '../../src/components/ui/button';

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
client.setQueryData(queryKeys.key('language-model-configuration', 'https://archive.invalid'), {
  configured: true,
  provider_id: 'amsc_mag',
  provider: 'openai',
  model: 'claude-opus-5-5-high@amazon',
  presets: [],
});
const options = buildModelOptions({
  activeCatalogProvider: 'amsc_mag',
  presets: [],
  providerCatalog: {
    authoritative: 'live_handshake',
    providers: [
      {
        id: 'amsc_mag',
        name: 'AMSC Model Access Gateway',
        kind: 'openai',
        endpoint: 'https://fixture.invalid/v1',
        configuration_url: '',
        connectivity: 'reachable',
        auth: 'ready',
        health: 'ready',
        failure: '',
        freshness: { source: 'live', generated_at: '' },
        models: [
          ['claude-opus-5-5-high@amazon', 1_000_000, 128_000],
          ['gpt-6-luna@openai', 922_000, 128_000],
          ['llama-4-scout@amazon', 10_000_000, 8192],
          ['unknown-limits@fixture', undefined, undefined],
        ].map(([id, context, output]) => ({
          model_id: String(id),
          provider_id: 'amsc_mag',
          provider_kind: 'openai',
          endpoint: 'https://fixture.invalid/v1',
          deployment: '',
          revision: '',
          modalities: ['text'],
          availability: 'available',
          failure: '',
          context_window: context as number | undefined,
          context_basis: 'served',
          output_limit: output as number | undefined,
          evidence: { source: 'live', live: true, generated_at: '', context_source: 'deployment' },
          capabilities_provenance: {
            context_window: { source: 'server_report', decided_by: 'deployment' },
            output_limit: { source: 'server_report', decided_by: 'deployment' },
          },
        })),
      },
    ],
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider
        value={createRepository({ endpoint: 'https://fixture.invalid' })}
      >
        <ForcedTheme theme="light">
          <AppearanceProvider>
            <MemoryRouter>
              <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-5 text-foreground">
                <p className="text-sm text-muted-foreground">
                  Fixture model rows. Production picker. No provider requests.
                </p>
                <ClioModelPicker
                  options={options}
                  provider="amsc_mag"
                  onChange={() => undefined}
                  trigger={<Button>Choose a model</Button>}
                />
              </main>
            </MemoryRouter>
          </AppearanceProvider>
        </ForcedTheme>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
