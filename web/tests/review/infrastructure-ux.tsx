import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ClioRepository } from '@clio/core/v3';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { InfrastructurePage } from '../../src/routes/infrastructure-page';
import '../../src/index.css';

// Test-only topology and receipts; never connect to real hosts or credentials.
const target = (id: string, kind: string, label: string) => ({
  id,
  kind,
  label,
  transport_state: 'connected',
  ssh: kind === 'ssh' ? { host: 'ares.example' } : undefined,
});
const tool = {
  id: 'collect',
  name: 'get_agent_task_output',
  title: 'Collect',
  source: 'native',
  visible_to: [],
  tags: [],
  description:
    'Fetch a completed task’s stored output. Use this after waiting for a task returns a summary too large to inline. Failed tasks retain their output and failure detail.',
  input_schema: {
    type: 'object',
    properties: { task_id: { type: 'string', description: 'A completed task ID.' } },
    required: ['task_id'],
  },
  output_schema: { type: 'string' },
};
const root = '\\\\?\\C:\\Users\\Alice\\AppData\\Local\\CLIO Desktop\\data\\clio-agent\\data';
const paths = {
  root,
  models: root + '\\models',
  service_data: root + '\\services',
  captures: root + '\\captures',
  temporary: root + '\\tmp',
};
const facts = {
  target_id: 'local',
  label: 'This computer',
  transport_state: 'connected',
  os: 'windows',
  arch: 'x86_64',
  accelerator: 'nvidia',
  docker_installed: true,
  docker_available: false,
  uv_available: true,
  hostname: 'WORKSTATION',
  home: 'C:\\Users\\Alice',
  container_runtimes: [
    { name: 'docker', installed: true, usable: false, failure: 'not_running' },
    { name: 'podman', installed: false, usable: false },
    { name: 'apptainer', installed: false, usable: false },
  ],
};
const repo = {
  infrastructureInventory: async () => ({
    targets: [target('local', 'local', "This CLIO's computer"), target('ares', 'ssh', 'Ares')],
    services: [],
    connections: [],
    operations: [],
    model_acquisitions: [],
  }),
  managedServiceCatalog: async () => ({ facts, services: [] }),
  savedServers: async () => [
    {
      id: 'llama',
      preset_id: 'llama_cpp',
      label: 'llama.cpp server',
      address: 'http://127.0.0.1:8088/v1',
      custom: false,
      check: {
        reachable: true,
        checked_at: new Date().toISOString(),
        connectivity: 'ok',
        models: ['Local model'],
      },
    },
  ],
  serviceHealth: async () => ({
    healthy: true,
    integrations: [
      {
        name: 'lm_provider',
        status: 'degraded',
        required: true,
        summary:
          'The default Codex provider is signed in. Its connection has not been checked recently.',
        config_source: 'default:codex',
      },
      { name: 'sandbox', status: 'degraded', required: true },
      ...['api', 'arc', 'gateway', 'file_policy', 'clio_core', 'child_processes'].map((name) => ({
        name,
        status: 'ready',
      })),
    ],
  }),
  sandboxStatus: async () => ({
    name: 'sandbox',
    status: 'degraded',
    reason: 'codex_enforcement_unverified',
    summary: 'Protected execution has not been verified on this computer.',
    setup_in_progress: false,
  }),
  catalogTools: async () => [tool],
  tools: async () => [tool],
  mcpServers: async () => [],
  hostStorageSettings: async (id: string) => ({
    target_id: id,
    host_label: 'This computer',
    requested: { root: '', models: '', service_data: '', captures: '', temporary: '' },
    defaults: paths,
    effective: paths,
  }),
  inspectHostPath: async () => ({
    path: root,
    exists: true,
    existing_ancestor: root,
    free_bytes: 107374182400,
    writable: true,
    parent: root,
    entries: [],
    truncated: false,
  }),
  modelInventory: async () => ({ models: [], errors: [] }),
  globusDestination: async () => ({ origin: 'none' }),
} as unknown as ClioRepository;
const section = new URLSearchParams(window.location.search).get('section') || 'overview';
createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" forcedTheme="dark">
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider value={repo}>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={[`/infrastructure/${section}`]}>
            <p className="border-b bg-background p-3 text-xs text-muted-foreground">
              Simulated infrastructure data; actual UI components. No live host, model or credential
              actions.
            </p>
            <div className="h-[calc(100dvh-41px)]">
              <Routes>
                <Route path="/infrastructure/:section" element={<InfrastructurePage />} />
              </Routes>
            </div>
          </MemoryRouter>
        </QueryClientProvider>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </ThemeProvider>,
);
