// Discover's cards and search (apps ledger DC) with the production Extensions library,
// fed by a fixture slice of the catalog. No service: enabling resolves after a pause.
// `?theme=dark`, `?width=phone` (a phone's Settings gutters instead of the window's).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { connectorSchema, pluginEntrySchema, type ClioRepository } from '@clio/core/v3';
import '../../src/index.css';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { ExtensionLibrary } from '../../src/components/clio/extension-library';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { ForcedTheme } from '../../src/theme/forced-theme';
import catalog from './fixtures/discover-catalog.json';

const params = new URLSearchParams(location.search);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Parsed as the repository would, so every field has its default.
let connectors = catalog.connectors.map((row) => connectorSchema.parse(row));
const plugins = catalog.plugins.map((row) => pluginEntrySchema.parse(row));
const repository = {
  capabilities: async () => ({
    capabilities: { x_clio_agent_plugins: true, x_clio_extension_library: true },
    gact_versions: [],
  }),
  plugins: async () => ({ plugins, default_marketplace_error: null }),
  pluginMarketplaces: async () => [],
  agents: async () => [],
  savedMcpServices: async () => [],
  mcpServers: async () => [],
  discoverMcp: async () => ({ servers: [], next_cursor: '' }),
  connectors: async () => connectors,
  connectorLogo: async (id: string) => (catalog.logos as Record<string, string>)[id] ?? '',
  enableConnector: async (id: string) => {
    await pause(1500);
    connectors = connectors.map((row) =>
      row.id === id ? { ...row, enabled: true, tool_count: 7 } : row,
    );
    return connectors.find((row) => row.id === id)!;
  },
} as unknown as ClioRepository;

const phone = params.get('width') === 'phone';
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider value={repository}>
        <ForcedTheme theme={params.get('theme') === 'dark' ? 'dark' : 'light'}>
          <AppearanceProvider>
            <MemoryRouter>
              <TooltipProvider>
                <main className="min-h-dvh bg-background text-foreground">
                  <div className={phone ? 'px-5 pt-4' : 'mx-auto max-w-[1100px] px-7 pt-4'}>
                    <div className="max-w-[760px] has-[[data-slot=extension-library]]:max-w-[1040px]">
                      <ExtensionLibrary />
                    </div>
                  </div>
                </main>
              </TooltipProvider>
            </MemoryRouter>
          </AppearanceProvider>
        </ForcedTheme>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
