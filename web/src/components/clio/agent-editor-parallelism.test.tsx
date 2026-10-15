import { agentDefinitionSchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentEditorDialog } from './agent-editor-dialog';

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({
    languageModelConfiguration: async () => ({ configured: false, presets: [] }),
  }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));
afterEach(cleanup);

const agent = agentDefinitionSchema.parse({
  id: 'reviewer',
  title: 'Reviewer',
  source: 'user',
  system_prompt: 'Review evidence.',
  fanout: { enabled: true, max_workers: 2, retained_option: 'keep' },
});

it('edits per-agent parallelism and Unlimited while preserving the rest of its definition', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AgentEditorDialog agent={agent} tools={[]} onClose={vi.fn()} onSave={onSave} />
    </QueryClientProvider>,
  );
  const input = screen.getByRole('spinbutton', { name: 'Per-agent parallelism' });
  expect(input).toHaveValue(2);
  await user.clear(input);
  await user.type(input, '5');
  await user.click(screen.getByRole('button', { name: 'Save agent' }));
  await waitFor(() =>
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fanout: { enabled: true, max_workers: 5, retained_option: 'keep' },
      }),
    ),
  );
  await user.click(screen.getByRole('switch', { name: 'Unlimited per-agent parallelism' }));
  expect(input).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Save agent' }));
  await waitFor(() =>
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fanout: { enabled: true, max_workers: 0, retained_option: 'keep' },
      }),
    ),
  );
});

it('does not rewrite fanout when editing an unrelated field and rejects invalid limits', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AgentEditorDialog agent={agent} tools={[]} onClose={vi.fn()} onSave={onSave} />
    </QueryClientProvider>,
  );
  await user.type(screen.getByRole('textbox', { name: 'Display name' }), ' updated');
  await user.click(screen.getByRole('button', { name: 'Save agent' }));
  await waitFor(() =>
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ fanout: agent.fanout })),
  );
  const input = screen.getByRole('spinbutton', { name: 'Per-agent parallelism' });
  await user.clear(input);
  await user.type(input, '-1');
  expect(screen.getByRole('button', { name: 'Save agent' })).toBeDisabled();
});
