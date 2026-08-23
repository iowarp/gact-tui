import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  workspaces: vi.fn(),
  prompts: vi.fn(),
  commands: vi.fn(),
  prompt: vi.fn(),
  renderPrompt: vi.fn(),
  validatePrompt: vi.fn(),
  savePrompt: vi.fn(),
  reloadPrompts: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { PromptsCommandsSettings } from './settings-prompts';

const prompt = {
  id: 'clio.main.planner',
  title: 'Planner instructions',
  description: 'Coordinates agent work.',
  default_profile: 'heavy',
  profiles: {
    heavy: {
      name: 'heavy',
      text: 'Use the available agent tree and preserve evidence.',
      scope: 'builtin',
      source_path: 'package://clio_agent.prompt_packs.builtin/clio.main.planner.md',
      provider: 'codex',
      model: 'gpt-5.6-luna',
      checksum: 'abc',
      metadata: {},
    },
  },
  scope: 'builtin',
  source_path: 'package://clio_agent.prompt_packs.builtin/clio.main.planner.md',
  enabled: true,
  validation_errors: [],
  metadata: {},
};

const resolved = {
  id: prompt.id,
  profile: 'heavy',
  text: prompt.profiles.heavy.text,
  title: prompt.title,
  description: prompt.description,
  scope: 'builtin',
  source_path: prompt.source_path,
  provider: 'codex',
  model: 'gpt-5.6-luna',
  validation_errors: [],
  metadata: {},
};

function renderSettings(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

beforeEach(() => {
  repository.workspaces.mockResolvedValue([
    {
      id: 'ws_science',
      name: 'science',
      display_name: 'Science campaign',
      path: 'D:/science/campaign',
      connection_id: 'local',
    },
  ]);
  repository.prompts.mockResolvedValue([prompt]);
  repository.commands.mockResolvedValue([
    {
      id: '/review',
      title: 'Review evidence',
      description: 'Review the selected evidence with the active specialist.',
      source: 'agent_blueprint',
      status: 'available',
      enabled: true,
      aliases: ['/inspect'],
      user_invocable: true,
      agent_invocable: true,
      argument_hint: '<artifact>',
      arguments: [],
      metadata: {},
    },
  ]);
  repository.prompt.mockResolvedValue(resolved);
  repository.renderPrompt.mockResolvedValue({
    ...resolved,
    text: 'Rendered with the live station specialist and permissions policy.',
  });
  repository.validatePrompt.mockResolvedValue({
    enabled: true,
    validation_errors: [],
    prompt,
  });
  repository.savePrompt.mockResolvedValue(prompt);
  repository.reloadPrompts.mockResolvedValue({ prompt_ids: [prompt.id], prompt_count: 1 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('prompt and command settings', () => {
  it('opens a packaged prompt as an explicit override with secondary provenance', async () => {
    const user = userEvent.setup();
    renderSettings(<PromptsCommandsSettings />);

    await user.click(await screen.findByRole('button', { name: /Planner instructions/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/packaged definition stays untouched/i)).toBeVisible();
    expect(within(dialog).getByLabelText('Instructions')).toHaveValue(prompt.profiles.heavy.text);
    expect(await within(dialog).findByText(prompt.source_path)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Save service override' })).toBeEnabled();
  });

  it('validates and saves a workspace override through the authoritative service routes', async () => {
    const user = userEvent.setup();
    renderSettings(<PromptsCommandsSettings />);

    await user.click(await screen.findByRole('combobox', { name: 'Prompt workspace' }));
    await user.click(screen.getByRole('option', { name: 'Science campaign' }));
    await user.click(await screen.findByRole('button', { name: /Planner instructions/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Prompt save scope' }));
    await user.click(screen.getByRole('option', { name: 'Selected workspace' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save workspace override' }));

    await waitFor(() => expect(repository.savePrompt).toHaveBeenCalled());
    expect(repository.validatePrompt).toHaveBeenCalledWith(prompt.id, {
      workspaceId: 'ws_science',
      profile: 'heavy',
      text: prompt.profiles.heavy.text,
    });
    expect(repository.savePrompt).toHaveBeenCalledWith(
      prompt.id,
      expect.objectContaining({ scope: 'workspace', workspaceId: 'ws_science' }),
    );
  });

  it('renders live prompt context and exposes command usage without raw event semantics', async () => {
    const user = userEvent.setup();
    renderSettings(<PromptsCommandsSettings />);

    await user.click(await screen.findByRole('button', { name: /Planner instructions/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('tab', { name: 'Rendered preview' }));
    await user.click(within(dialog).getByRole('button', { name: 'Render effective prompt' }));
    expect(await within(dialog).findByText(/live station specialist/)).toBeVisible();
    expect(repository.renderPrompt).toHaveBeenCalledWith(prompt.id, { profile: 'heavy' });

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('tab', { name: 'Commands' }));
    await user.click(await screen.findByRole('button', { name: /Review evidence/ }));
    const commandDialog = screen.getByRole('dialog');
    expect(within(commandDialog).getByText('/review <artifact>')).toBeVisible();
    expect(within(commandDialog).getByText('For agents')).toBeVisible();
    expect(within(commandDialog).getByText(/Also available as \/inspect/)).toBeVisible();
  });
});
