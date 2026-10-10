import { createRoot } from 'react-dom/client';
import { useMemo, useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import type { LanguageModelConfiguration, ProviderComponentUpdate } from '@clio/core/v3';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { createRepository } from '../../src/lib/connection';
import { ClioModelPicker } from '../../src/components/clio/model-picker';
import { SettingsChoice, SettingsRow } from '../../src/components/clio/settings-row';
import { Button } from '../../src/components/ui/button';
import { Toaster } from '../../src/components/ui/sonner';
import { ProvidersSettings } from '../../src/components/clio/settings-providers';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const presets = [
  {
    id: 'codex',
    label: 'Codex',
    provider: 'codex',
    api_base: 'codex://direct',
    auth_method: 'subscription',
  },
  {
    id: 'claude_code',
    label: 'Claude Code',
    provider: 'claude_code',
    api_base: 'claude-code://sdk',
    auth_method: 'subscription',
  },
  {
    id: 'llama_cpp',
    label: 'llama.cpp server',
    provider: 'openai',
    api_base: 'http://127.0.0.1:8088/v1',
    auth_method: 'none',
  },
].map((preset) => ({
  ...preset,
  requires_api_key: false,
  is_authenticated: true,
  supports_live_catalog: true,
  supports_vision: true,
}));

function Review() {
  const [provider, setProvider] = useState('codex');
  const [sound, setSound] = useState('off');
  const [address, setAddress] = useState('http://127.0.0.1:8088/v1');
  const [updated, setUpdated] = useState(false);
  const location = useLocation();
  const configuration: LanguageModelConfiguration = {
    configured: true,
    provider_id: 'codex',
    provider: 'codex',
    model: 'gpt-6-sol',
    api_base: 'codex://direct',
    presets: presets.map((row) => (row.id === 'llama_cpp' ? { ...row, api_base: address } : row)),
  };
  const repository = useMemo(
    () =>
      Object.assign(createRepository({ endpoint: 'https://fixture.invalid' }), {
        languageModelConfiguration: async () => configuration,
        providerCatalog: async () => ({ authoritative: 'live_handshake', providers: [] }),
        savedServers: async () => [],
        providerComponents: async (id: string) => ({
          provider_id: id,
          provider_kind: id,
          installed: true,
          update_available: id === 'codex' && !updated,
          target_version: id === 'codex' ? '0.161.0' : '0.2.164',
          checked_at: '',
          release_notes_url: '',
          components: [
            {
              distribution: id === 'codex' ? 'openai-codex-cli-bin' : 'claude-agent-sdk',
              installed_version: id === 'codex' ? (updated ? '0.161.0' : '0.157.1') : '0.2.164',
              latest_version: id === 'codex' ? '0.161.0' : '0.2.164',
              update_available: id === 'codex' && !updated,
            },
          ],
        }),
        updateProviderComponents: async (id: string): Promise<ProviderComponentUpdate> => {
          setUpdated(true);
          return {
            provider_kind: id,
            stage: 'done',
            running: false,
            changed: true,
            rolled_back: false,
            restart_required: false,
            from_versions: {},
            to_versions: {},
            started_at: 'fixture',
            finished_at: 'fixture',
          };
        },
        refreshProviderModels: async (ids: string[]) =>
          ids.map((id) => ({
            provider: id,
            discovered: [],
            added: [],
            removed: [],
            unchanged: [],
            rejected:
              id === 'claude_code'
                ? [
                    {
                      id: 'claude-haiku-5-5',
                      code: 'client_update_required',
                      minimum_client_version: '2.1.293',
                      reason: 'Haiku 5.5 needs a newer Claude Code client.',
                    },
                  ]
                : [],
            source: 'fixture',
            default_model: '',
            generated_at: '',
          })),
        addSavedServer: async (input: { address: string }) => {
          setAddress(input.address);
          return {
            id: 'llama_cpp',
            preset_id: 'llama_cpp',
            label: 'llama.cpp server',
            address: input.address,
            custom: false,
            credential_ref: '',
            check: { reachable: true, models: [] },
          };
        },
      }),
    [address, updated],
  );
  const options = [
    {
      providerId: 'codex',
      providerName: 'Codex',
      id: 'gpt-6-sol',
      label: 'GPT-6 Sol',
      available: true,
      health: 'ready',
      endpoint: 'codex://direct',
    },
    {
      providerId: 'claude_code',
      providerName: 'Claude Code',
      id: 'claude-sonnet-5',
      label: 'Sonnet 5',
      client: {
        source: 'bundled' as const,
        version: '2.1.292',
        path: '',
        reason: 'fixture',
        installed_version: '',
        bundled_version: '2.1.292',
      },
      available: true,
      health: 'ready',
      endpoint: 'claude-code://sdk',
    },
    {
      providerId: 'llama_cpp',
      providerName: 'llama.cpp server',
      id: '',
      label: 'llama.cpp server',
      available: false,
      health: 'unavailable',
      kind: 'provider' as const,
      endpoint: address,
    },
  ];
  return (
    <RepositoryOverride.Provider value={repository}>
      <main className="mx-auto max-w-4xl space-y-5 p-6 text-foreground">
        <h1 className="text-lg font-semibold">Provider setup · browser fixture</h1>
        <p className="text-sm text-muted-foreground">
          Simulated provider replies. Real UI components. No account, model or default writes.
        </p>
        <SettingsRow
          title="Attention sound"
          description="Play a short chime when a session needs your response."
        >
          <SettingsChoice
            id="attention"
            label="Attention sound"
            value={sound}
            onChange={setSound}
            options={[
              { value: 'background', label: 'In background' },
              { value: 'always', label: 'Always' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </SettingsRow>
        <div className="flex flex-wrap gap-2">
          {presets.map((row) => (
            <Button key={row.id} variant="outline" onClick={() => setProvider(row.id)}>
              {row.label}
            </Button>
          ))}
        </div>
        <ClioModelPicker
          onChange={() => {}}
          options={options}
          provider={provider}
          trigger={<Button>Choose model</Button>}
        />
        <output className="block text-xs text-muted-foreground">
          {location.pathname}
          {location.search}
        </output>
        {location.pathname === '/settings/providers' ? <ProvidersSettings /> : null}
      </main>
      <Toaster />
    </RepositoryOverride.Provider>
  );
}
createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <ArchiveConnectionProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <Review />
        </QueryClientProvider>
      </MemoryRouter>
    </ArchiveConnectionProvider>
  </ThemeProvider>,
);
