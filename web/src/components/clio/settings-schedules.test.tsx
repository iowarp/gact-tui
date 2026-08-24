import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  allSessions: vi.fn().mockResolvedValue([
    {
      id: 'sess_other',
      workspace_id: 'ws_1',
      title: 'Earlier session',
      archived: false,
    },
    {
      id: 'sess_1',
      workspace_id: 'ws_1',
      title: 'Evidence review',
      archived: false,
    },
  ]),
  workspaces: vi.fn().mockResolvedValue([{ id: 'ws_1', display_name: 'EarthScope campaign' }]),
  scheduledTurns: vi.fn().mockResolvedValue({
    timezone: 'America/Chicago',
    schedules: [
      {
        id: 'schedule_1',
        session_id: 'sess_1',
        question: 'Inspect fresh results.',
        enabled: true,
        created_at: '2026-08-23T10:00:00Z',
        cron: '0 9 * * 1-5',
        timezone: 'America/Chicago',
        recurring: true,
        run_at: '',
        next_fire_at: '2026-08-24T14:00:00Z',
        last_fired_at: '',
        fire_count: 0,
        max_fires: 0,
        until: '',
        overlap_policy: 'queue',
        retry_count: 0,
        last_error: '',
        disabled_reason: '',
      },
    ],
  }),
  createScheduledTurn: vi.fn().mockResolvedValue({ id: 'schedule_2' }),
  deleteScheduledTurn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { ScheduleSettings } from './settings-schedules';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSettings(initialSessionId?: string) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ScheduleSettings initialSessionId={initialSessionId} />
    </QueryClientProvider>,
  );
}

describe('scheduled work settings', () => {
  it('creates and cancels session-owned work without exposing paths or fake progress', async () => {
    const user = userEvent.setup();
    renderSettings('sess_1');

    expect(await screen.findByText('Inspect fresh results.')).toBeVisible();
    expect(screen.getByText('Weekdays')).toBeVisible();
    expect(screen.getByText(/America\/Chicago/)).toBeVisible();
    expect(screen.queryByText(/D:\\/u)).not.toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: 'Instruction' }),
      'Summarize new station evidence.',
    );
    await user.click(screen.getByRole('button', { name: 'Schedule work' }));

    await waitFor(() =>
      expect(repository.createScheduledTurn).toHaveBeenCalledWith(
        'sess_1',
        expect.objectContaining({
          question: 'Summarize new station evidence.',
          recurring: false,
          overlap_policy: 'queue',
          run_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
        }),
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'Cancel scheduled work: Inspect fresh results.' }),
    );
    await user.click(screen.getByRole('button', { name: /^Cancel scheduled work$/u }));
    await waitFor(() => expect(repository.deleteScheduledTurn).toHaveBeenCalledWith('schedule_1'));
  });
});
