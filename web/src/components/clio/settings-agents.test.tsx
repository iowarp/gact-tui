import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

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
      <QueryClientProvider client={queryClient}>
        <AgentSettings />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Actions for EarthScope Reviewer' }));
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
    repository.agents.mockResolvedValue([{ ...agent, id: 'main', title: 'Main Agent', source: 'builtin' }]);
    repository.tools.mockResolvedValue([]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AgentSettings />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Main Agent')).toBeVisible();
    expect(screen.getByText('Built in')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Actions for Main Agent' })).not.toBeInTheDocument();
  });
});
