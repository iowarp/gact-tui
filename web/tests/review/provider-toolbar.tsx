import type { LanguageModelPreset } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { useProviderPanel } from '../../src/components/clio/model-picker-provider-panel';
import type { ProviderGroup } from '../../src/components/clio/model-picker-model';
import { createRepository } from '../../src/lib/connection';
import { queryKeys } from '../../src/lib/query-keys';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { ForcedTheme } from '../../src/theme/forced-theme';
import '../../src/index.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const presets: LanguageModelPreset[] = [
  {
    id: 'codex',
    label: 'Codex',
    provider: 'codex',
    suggested_model: 'Luna',
    requires_api_key: false,
    auth_method: 'subscription',
    is_authenticated: true,
    supports_logout: true,
  },
  {
    id: 'claude_code',
    label: 'Claude Code',
    provider: 'claude_code',
    suggested_model: 'Sonnet',
    requires_api_key: false,
    auth_method: 'subscription',
    is_authenticated: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai',
    suggested_model: 'GPT',
    api_base: 'https://api.openai.com/v1',
    requires_api_key: true,
    auth_method: 'api_key',
    is_authenticated: true,
  },
  {
    id: 'vllm',
    label: 'Local vLLM',
    provider: 'openai',
    suggested_model: 'Qwen',
    api_base: 'http://localhost:8000/v1',
    requires_api_key: false,
    auth_method: 'none',
    is_authenticated: true,
  },
];

for (const [id, installed, latest, distribution] of [
  ['codex', '0.162.1', '0.163.0', 'openai-codex-cli-bin'],
  ['claude_code', '0.1.63', '0.1.64', 'claude-agent-sdk'],
]) {
  client.setQueryData(queryKeys.key('provider-components', 'https://archive.invalid', id), {
    provider_id: id,
    provider_kind: id,
    installed: true,
    update_available: true,
    target_version: latest,
    checked_at: '',
    release_notes_url: '',
    components: [
      {
        distribution,
        installed_version: installed,
        latest_version: latest,
        update_available: true,
      },
    ],
  });
}

function Panel({ preset }: { preset: LanguageModelPreset }) {
  const choice = {
    id: preset.suggested_model,
    label: preset.suggested_model,
    providerId: preset.id,
    providerName: preset.label,
    available: true,
  };
  const group: ProviderGroup = {
    id: preset.id,
    name: preset.label,
    health: 'healthy',
    endpoint: preset.api_base,
    choices: [choice],
    availableChoices: [choice],
    ...(preset.id === 'claude_code'
      ? {
          client: { source: 'bundled', version: '2.1.276', path: 'D:/clio/claude.exe' },
        }
      : {}),
  };
  // Use the production composition, including provider capability checks and
  // the shared Settings link. Closed queries keep the review entirely offline.
  const { column } = useProviderPanel({ group, preset, open: false });
  return (
    <section
      className="w-full max-w-[373px] overflow-hidden rounded-lg border bg-background"
      aria-label={preset.label}
    >
      <h2 className="border-b px-3 py-2 text-sm font-medium">{preset.label}</h2>
      <p className="px-3 py-4 text-sm">{choice.label}</p>
      {column.footer}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider
        value={createRepository({ endpoint: 'https://fixture.invalid' })}
      >
        <ForcedTheme theme="light">
          <MemoryRouter>
            <main className="min-h-dvh bg-background p-6 text-foreground">
              <h1 className="text-xl font-medium">Provider controls</h1>
              <p className="mb-6 mt-2 text-sm text-muted-foreground">
                Production provider panels with synthetic data. No provider requests or inference.
              </p>
              <div className="grid max-w-[770px] grid-cols-1 gap-6 sm:grid-cols-2">
                {presets.map((preset) => (
                  <Panel key={preset.id} preset={preset} />
                ))}
              </div>
            </main>
          </MemoryRouter>
        </ForcedTheme>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
