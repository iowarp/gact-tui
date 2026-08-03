import { describe, expect, it, vi } from 'vitest';
import { createChatSessionScheduleActions } from '../../src/routes/chatSessionScheduleActions.js';

function makeActions(overrides: {
  activeId?: string;
  createSchedule?: ReturnType<typeof vi.fn>;
  deleteSchedule?: ReturnType<typeof vi.fn>;
} = {}) {
  const toastPush = vi.fn();
  const failToast = vi.fn();
  const refetchSchedules = vi.fn();
  const createSchedule = overrides.createSchedule ?? vi.fn().mockResolvedValue(undefined);
  const deleteSchedule = overrides.deleteSchedule ?? vi.fn().mockResolvedValue(undefined);
  const actions = createChatSessionScheduleActions({
    activeId: () => overrides.activeId ?? 's1',
    client: { createSchedule, deleteSchedule },
    toastPush,
    failToast,
    refetchSchedules,
  });
  return {
    actions,
    createSchedule,
    deleteSchedule,
    toastPush,
    failToast,
    refetchSchedules,
  };
}

describe('createChatSessionScheduleActions', () => {
  it('creates a schedule for the active session and refetches schedules', async () => {
    const h = makeActions();
    const body = { cron: '0 * * * *', prompt: 'Summarize' };

    await h.actions.createSchedule(body);

    expect(h.createSchedule).toHaveBeenCalledWith('s1', body);
    expect(h.refetchSchedules).toHaveBeenCalledOnce();
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'success',
      title: 'Schedule added',
      body: '0 * * * *',
      duration: 2400,
    });
  });

  it('does not create a schedule without an active session', async () => {
    const h = makeActions({ activeId: '' });

    await h.actions.createSchedule({ cron: '* * * * *', prompt: 'Run' });

    expect(h.createSchedule).not.toHaveBeenCalled();
    expect(h.refetchSchedules).not.toHaveBeenCalled();
  });

  it('reports create failures with retry callback', async () => {
    const error = new Error('denied');
    const h = makeActions({ createSchedule: vi.fn().mockRejectedValue(error) });

    await h.actions.createSchedule({ cron: '* * * * *', prompt: 'Run' });

    expect(h.failToast).toHaveBeenCalledWith(
      'Could not add schedule',
      error,
      expect.any(Function),
    );
    expect(h.refetchSchedules).not.toHaveBeenCalled();
  });

  it('deletes a schedule and refetches schedules', async () => {
    const h = makeActions();

    await h.actions.deleteSchedule('sched1');

    expect(h.deleteSchedule).toHaveBeenCalledWith('sched1');
    expect(h.refetchSchedules).toHaveBeenCalledOnce();
  });

  it('reports delete failures with retry callback', async () => {
    const error = new Error('denied');
    const h = makeActions({ deleteSchedule: vi.fn().mockRejectedValue(error) });

    await h.actions.deleteSchedule('sched1');

    expect(h.failToast).toHaveBeenCalledWith(
      'Could not delete schedule',
      error,
      expect.any(Function),
    );
    expect(h.refetchSchedules).not.toHaveBeenCalled();
  });
});
