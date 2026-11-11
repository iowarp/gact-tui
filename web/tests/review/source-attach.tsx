import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { RepositoryOverrideProvider } from '../../src/providers/repository-override';
import { ConnectedSourcePicker } from '../../src/components/clio/connected-source-picker';
import '../../src/index.css';

// Synthetic data rendered by the production Attach dialog: a fresh workspace
// with no conversations (?state=empty) or one with recent conversations.
const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const empty = params.get('state') === 'empty';
const sessions = empty
  ? []
  : [
      'Soil moisture anomalies, 2022 drought',
      'Compare OPAL stations with SMAP L3',
      'Draft the methods section',
    ].map((title, index) => ({
      id: `session_${index}`,
      workspace_id: 'workspace',
      title,
      state: 'idle',
      created_at: '2026-11-09T10:00:00Z',
      updated_at: '2026-11-09T10:00:00Z',
    }));
const source = {
  id: 's1',
  label: 'OPAL inputs',
  provider: 'local',
  root: '/data/opal/inputs',
  mode: 'working_copy',
  owner: { clio_id: 'one', host_id: 'local' },
  connected: true,
  authenticated: true,
  materialization: 'ready',
  local_path: '/workspace/connected-data/s1',
  revision: 'r1',
  configuration: {},
  capabilities: { supported_modes: ['read_only', 'working_copy'], unavailable_reasons: {} },
  can_edit_location: false,
  download_available: true,
  linked: false,
  link_available: true,
};
const methods: Record<string, (...args: never[]) => Promise<unknown>> = {
  connectedSources: async () => [source],
  storageProviders: async () => ({ providers: [] }),
  hostStorageSettings: async () => ({
    hostname: 'delta-node',
    host_label: 'Research CLIO',
    effective: { root: '/home/alice' },
  }),
  sourceOperations: async () => [],
  sourceMappingOptions: async () => ({
    link_access: ['read_only', 'publish_later', 'write_through'],
    write_permission: true,
    reason: 'File permissions are checked when publishing.',
  }),
  browseConnectedSource: async () => ({
    entries: [
      { path: 'stations.csv', kind: 'file', size: 48_211, revision: 'r1' },
      { path: 'smap_l3_2022.h5', kind: 'file', size: 9_400_000, revision: 'r1' },
      { path: 'notes', kind: 'directory', revision: 'r1' },
    ],
    next_offset: null,
  }),
  sessionPage: async () => ({ sessions, next_cursor: null, total: sessions.length }),
  sessionsById: async () => [],
  sessionFamily: async () => [],
  sessionsWaitingOnPerson: async () => [],
};
const repository = new Proxy(methods, {
  get: (target, key: string) => target[key] ?? (async () => []),
}) as never;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <ArchiveConnectionProvider>
    <RepositoryOverrideProvider repository={repository}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ForcedTheme theme={theme}>
            <main className="min-h-dvh bg-background text-foreground" />
            <ConnectedSourcePicker
              workspaceId="workspace"
              open
              onOpenChange={() => undefined}
              onSelect={() => undefined}
              onUploadFiles={() => undefined}
            />
          </ForcedTheme>
        </MemoryRouter>
      </QueryClientProvider>
    </RepositoryOverrideProvider>
  </ArchiveConnectionProvider>,
);
