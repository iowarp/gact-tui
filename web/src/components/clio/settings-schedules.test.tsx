import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
    {
      id: 'sess_child',
      parent_session_id: 'sess_1',
      workspace_id: 'ws_1',
      title: 'Analysis task',
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
  setScheduleEnabled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { ScheduleSettings } from './settings-schedules';
import { TooltipProvider } from '@/components/ui/tooltip';
import { sessionReads } from '@/test/session-reads';

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
      <TooltipProvider>
        <ScheduleSettings initialSessionId={initialSessionId} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const findRow = () =>
  screen.findByRole('group', { name: 'Inspect fresh results.' }, { timeout: 5000 });

async function openNewDialog(user: ReturnType<typeof userEvent.setup>) {
  await findRow();
  await user.click(screen.getByRole('button', { name: 'New scheduled work' }));
  return screen.findByRole('dialog', { name: 'New scheduled work' });
}

// Dialogs and menus make these interactions slow on a loaded runner.
describe('scheduled work settings', { timeout: 30_000 }, () => {
  it('lists each instruction with its workspace, timing in words and a status word', async () => {
    renderSettings('sess_1');
    const row = await findRow();
    expect(within(row).getByText(/EarthScope campaign/u)).toHaveTextContent(
      'EarthScope campaign, Weekdays 09:00',
    );
    expect(within(row).getByText('Scheduled')).toBeVisible();
    expect(screen.getByText('Upcoming')).toBeVisible();
    expect(screen.queryByText(/D:\\/u)).not.toBeInTheDocument();
  });

  it('submits a typed repeating time in the service time zone only on Schedule work', async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings('sess_1');
    const dialog = await openNewDialog(user);
    await user.click(within(dialog).getByRole('radio', { name: /^Repeats/u }));
    const time = within(dialog).getByRole('textbox', { name: 'Time' });
    await user.clear(time);
    await user.type(time, '14:35');
    await user.tab();
    expect(within(dialog).getByText('Every weekday at 14:35')).toBeVisible();
    expect(within(dialog).getByText('America/Chicago')).toBeVisible();
    expect(repository.createScheduledTurn).not.toHaveBeenCalled();
    await user.type(within(dialog).getByRole('textbox', { name: /Instruction/u }), 'Review.');
    await user.click(within(dialog).getByRole('button', { name: /^Schedule work/u }));
    await waitFor(() =>
      expect(repository.createScheduledTurn).toHaveBeenCalledWith(
        'sess_1',
        expect.objectContaining({
          question: 'Review.',
          cron: '35 14 * * 1-5',
          timezone: 'America/Chicago',
          recurring: true,
        }),
      ),
    );
  });

  it('schedules a one-time run in the device time zone', async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings('sess_1');
    const dialog = await openNewDialog(user);
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(within(dialog).getByText(deviceTimezone)).toBeVisible();
    await user.type(
      within(dialog).getByRole('textbox', { name: /Instruction/u }),
      'Summarize evidence.',
    );
    await user.click(within(dialog).getByRole('button', { name: /^Schedule work/u }));
    await waitFor(() =>
      expect(repository.createScheduledTurn).toHaveBeenCalledWith(
        'sess_1',
        expect.objectContaining({
          question: 'Summarize evidence.',
          recurring: false,
          overlap_policy: 'queue',
          run_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
        }),
      ),
    );
  });

  it('offers only primary sessions to schedule work in', async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings('sess_1');
    await findRow();
    await user.click(screen.getByRole('button', { name: /^Session: Evidence review/u }));
    expect(
      await screen.findByRole('menuitemradio', { name: /Earlier session/u }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: /Analysis task/u })).not.toBeInTheDocument();
  });

  it('pauses, edits by replacing, and deletes after an inline confirmation', async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings('sess_1');
    const row = await findRow();

    await user.click(within(row).getByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(repository.setScheduleEnabled).toHaveBeenCalledWith('sess_1', 'schedule_1', false),
    );

    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit scheduled work' });
    const instruction = within(dialog).getByRole('textbox', { name: /Instruction/u });
    expect(instruction).toHaveValue('Inspect fresh results.');
    await user.clear(instruction);
    await user.type(instruction, 'Inspect twice.');
    await user.click(within(dialog).getByRole('button', { name: /^Save changes/u }));
    await waitFor(() => expect(repository.deleteScheduledTurn).toHaveBeenCalledWith('schedule_1'));
    expect(repository.createScheduledTurn).toHaveBeenCalledWith(
      'sess_1',
      expect.objectContaining({
        question: 'Inspect twice.',
        cron: '0 9 * * 1-5',
        recurring: true,
      }),
    );
    expect(repository.createScheduledTurn.mock.invocationCallOrder[0]).toBeLessThan(
      repository.deleteScheduledTurn.mock.invocationCallOrder[0] ?? 0,
    );
    vi.clearAllMocks();

    const current = await findRow();
    await user.click(within(current).getByRole('button', { name: 'Delete' }));
    const confirming = screen.getByRole('group', { name: 'Inspect fresh results.' });
    expect(within(confirming).getByText('Delete this schedule?')).toBeVisible();
    await user.click(within(confirming).getByRole('button', { name: 'Keep schedule' }));
    expect(repository.deleteScheduledTurn).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole('group', { name: 'Inspect fresh results.' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await user.click(
      within(screen.getByRole('group', { name: 'Inspect fresh results.' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() => expect(repository.deleteScheduledTurn).toHaveBeenCalledWith('schedule_1'));
  });

  it('shows loading, then an error with Retry rather than a false empty state', async () => {
    let reject!: (reason: Error) => void;
    repository.scheduledTurns.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    renderSettings('sess_1');
    expect(await screen.findByText('Loading scheduled work…')).toBeVisible();
    reject(new Error('Service unavailable'));
    expect(await screen.findByText('Scheduled work could not be loaded')).toBeVisible();
    expect(screen.queryByText('Service unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing is scheduled in Evidence review')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Inspect fresh results.')).toBeVisible();
  });

  it('says plainly when nothing is scheduled and keeps add available', async () => {
    repository.scheduledTurns.mockResolvedValueOnce({ timezone: 'America/Chicago', schedules: [] });
    renderSettings('sess_1');
    expect(await screen.findByText('Nothing is scheduled in Evidence review')).toBeVisible();
    expect(screen.getByRole('button', { name: 'New scheduled work' })).toBeEnabled();
  });
});

// The bounded session reads, answered from this test's session list.
Object.assign(
  repository,
  sessionReads(() => repository.allSessions()),
);
