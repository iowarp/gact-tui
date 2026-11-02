import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { PromptDefinition } from '@clio/core/v3';
import { reminderMeta } from '@/lib/reminder-meta';
import { RemindersList } from './settings-reminders';

const { repository } = vi.hoisted(() => ({
  repository: { prompt: vi.fn(), savePrompt: vi.fn() },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const reminder = {
  id: 'clio.reminder.explore_nudge',
  title: 'Suggest Explore while searching',
  description: 'After a run of reading calls, remind the agent that explore exists.',
  default_profile: 'default',
  scope: 'builtin',
  enabled: true,
  validation_errors: [],
  metadata: {},
  profiles: {
    default: {
      name: 'default',
      metadata: {
        kind: 'reminder',
        active: true,
        trigger: 'after 6 reading calls with no delegation',
        variables: ['calls', 'explore_model'],
      },
    },
  },
} as unknown as PromptDefinition;
const plain = { ...reminder, id: 'clio.chat', profiles: { default: { name: 'default' } } };

it('lists reminders with their trigger and variables, and switches one off', async () => {
  expect(reminderMeta(plain as unknown as PromptDefinition)).toBeNull();
  repository.prompt.mockResolvedValue({
    text: 'You have made {{calls}} reading calls.',
    title: reminder.title,
    metadata: { kind: 'reminder', active: true },
  });
  repository.savePrompt.mockResolvedValue({});
  const onChanged = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RemindersList
        prompts={[reminder, plain as unknown as PromptDefinition]}
        onEdit={vi.fn()}
        onChanged={onChanged}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Suggest Explore while searching')).toBeTruthy();
  expect(screen.queryByText('clio.chat')).toBeNull();
  expect(screen.getByText('When: after 6 reading calls with no delegation')).toBeTruthy();
  expect(screen.getByText('Variables: {{calls}}, {{explore_model}}')).toBeTruthy();
  expect(screen.getByText('On')).toBeTruthy();
  await userEvent
    .setup()
    .click(screen.getByRole('switch', { name: 'Suggest Explore while searching on' }));
  await waitFor(() =>
    expect(repository.savePrompt).toHaveBeenCalledWith('clio.reminder.explore_nudge', {
      scope: 'global',
      profile: 'default',
      text: 'You have made {{calls}} reading calls.',
      title: 'Suggest Explore while searching',
      description: 'After a run of reading calls, remind the agent that explore exists.',
      metadata: { kind: 'reminder', active: false },
    }),
  );
  expect(onChanged).toHaveBeenCalled();
});
