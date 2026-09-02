import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentSettings } from './settings-agents';

const agent = {
  id: 'earthscope-reviewer',
  title: 'EarthScope Reviewer',
  description: 'Reviews station evidence.',
  source: 'user',
  enabled: true,
  validation_errors: [],
  parent_id: '',
  system_prompt: 'Ground every claim.',
  prompt_id: '',
  prompt_profile: '',
  default_provider: 'codex',
  default_model: 'gpt-5.6-luna',
  api_base: '',
  credential_ref: '',
  transport: '',
  parameters: { temperature: 0 },
  module: {},
  signature: {},
  structured_outputs: {},
  fanout: {},
  tools: ['geo_geocode'],
  skills: ['station-review'],
  commands: ['review-station'],
  capability_refs: [],
  metadata: { owner: 'science' },
  tier: 2,
  specialization: 'GNSS evidence',
  keywords: ['earthscope'],
};

const repository = vi.hoisted(() => ({
  agents: vi.fn(),
  tools: vi.fn(),
  languageModelConfiguration: vi.fn().mockResolvedValue({
    configured: true,
    provider: 'codex',
    api_base: '',
    model: 'gpt-5.6-luna',
    presets: [
      {
        id: 'codex',
        label: 'Codex',
        provider: 'codex',
        suggested_model: 'gpt-5.6-luna',
        requires_api_key: false,
        is_authenticated: true,
        supports_live_catalog: true,
        supports_vision: true,
      },
      {
        id: 'claude_code',
        label: 'Claude Code',
        provider: 'claude_code',
        suggested_model: 'sonnet',
        requires_api_key: false,
        is_authenticated: true,
        supports_live_catalog: true,
        supports_vision: true,
      },
    ],
  }),
  providerModels: vi.fn().mockImplementation(async (providerId: string) => ({
    provider_id: providerId,
    source: 'connected_agent',
    models:
      providerId === 'claude_code'
        ? [{ id: 'sonnet', name: 'Claude Sonnet' }]
        : [{ id: 'gpt-5.6-luna', name: 'GPT-5.6-Luna' }],
  })),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      matches: true,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AgentSettings', () => {
  it('edits a user agent without dropping its hidden execution fields', async () => {
    repository.agents.mockResolvedValue([agent]);
    repository.tools.mockResolvedValue([
      {
        id: 'geo_geocode',
        name: 'geo_geocode',
        title: 'Resolve a place',
        description: 'Resolve place names to coordinates.',
        source: 'mcp',
        server_id: 'science',
        tags: [],
        visible_to: [],
      },
    ]);
    repository.updateAgent.mockImplementation(async (_id, value) => value);
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AgentSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Actions for EarthScope Reviewer' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Edit agent' }));
    const name = screen.getByRole('textbox', { name: 'Display name' });
    await user.clear(name);
    await user.type(name, 'Station Evidence Reviewer');
    await user.click(screen.getByRole('button', { name: 'Save agent' }));

    await waitFor(() => expect(repository.updateAgent).toHaveBeenCalledTimes(1));
    expect(repository.updateAgent).toHaveBeenCalledWith(
      'earthscope-reviewer',
      expect.objectContaining({
        title: 'Station Evidence Reviewer',
        system_prompt: 'Ground every claim.',
        tools: ['geo_geocode'],
        parameters: { temperature: 0 },
        metadata: { owner: 'science' },
      }),
    );
  });

  it('keeps built-in agents immutable in the settings surface', async () => {
    repository.agents.mockResolvedValue([
      { ...agent, id: 'main', title: 'Main Agent', source: 'builtin' },
    ]);
    repository.tools.mockResolvedValue([]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AgentSettings />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Main Agent')).toBeVisible();
    expect(screen.getByText('Built in')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Actions for Main Agent' }),
    ).not.toBeInTheDocument();
  });

  it('offers discovered providers and models before exposing custom identifiers', async () => {
    repository.agents.mockResolvedValue([agent]);
    repository.tools.mockResolvedValue([]);
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AgentSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'New agent' }));
    expect(screen.queryByRole('textbox', { name: 'Provider identifier' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Preferred model' }));
    await user.click(await screen.findByRole('button', { name: /Claude/ }));
    expect(await screen.findByRole('option', { name: /Claude Sonnet/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /OpenAI Codex/ }));
    expect(screen.getByRole('option', { name: /GPT-5.6-Luna/ })).toBeVisible();
  });

  it('does not report an empty tool catalog while the service is still loading it', async () => {
    repository.agents.mockResolvedValue([agent]);
    repository.tools.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AgentSettings />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'New agent' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading available tools…');
    expect(screen.queryByText(/No available tools/u)).not.toBeInTheDocument();
  });
});
