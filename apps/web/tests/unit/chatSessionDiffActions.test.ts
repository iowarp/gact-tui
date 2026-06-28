import { describe, expect, it, vi } from 'vitest';
import { createChatSessionDiffActions } from '../../src/routes/chatSessionDiffActions.js';

function makeActions(overrides: {
  activeId?: string;
  applySessionDiffs?: ReturnType<typeof vi.fn>;
  rejectSessionDiffs?: ReturnType<typeof vi.fn>;
  confirmReject?: (message: string) => boolean;
} = {}) {
  const toastPush = vi.fn();
  const failToast = vi.fn();
  const refetchSessionDiffs = vi.fn();
  const applySessionDiffs =
    overrides.applySessionDiffs ??
    vi.fn().mockResolvedValue({ applied: ['a.ts'], write_errors: undefined });
  const rejectSessionDiffs =
    overrides.rejectSessionDiffs ?? vi.fn().mockResolvedValue({ rejected: ['a.ts'] });
  const actions = createChatSessionDiffActions({
    activeId: () => overrides.activeId ?? 's1',
    client: { applySessionDiffs, rejectSessionDiffs },
    toastPush,
    failToast,
    refetchSessionDiffs,
    confirmReject: overrides.confirmReject,
  });
  return {
    actions,
    applySessionDiffs,
    rejectSessionDiffs,
    toastPush,
    failToast,
    refetchSessionDiffs,
  };
}

describe('createChatSessionDiffActions', () => {
  it('applies all diffs, reports successes and write errors, then refetches', async () => {
    const h = makeActions({
      applySessionDiffs: vi.fn().mockResolvedValue({
        applied: ['a.ts', 'b.ts'],
        write_errors: { 'c.ts': 'permission denied' },
      }),
    });

    await h.actions.applyAllDiffs();

    expect(h.applySessionDiffs).toHaveBeenCalledWith('s1');
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'success',
      title: 'Diffs applied',
      body: '2 files',
      duration: 3000,
    });
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'error',
      title: 'Write failed: c.ts',
      body: 'permission denied',
      duration: 6000,
    });
    expect(h.refetchSessionDiffs).toHaveBeenCalledOnce();
  });

  it('reports apply failures through failToast', async () => {
    const error = new Error('boom');
    const h = makeActions({ applySessionDiffs: vi.fn().mockRejectedValue(error) });

    await h.actions.applyAllDiffs();

    expect(h.failToast).toHaveBeenCalledWith('Apply failed', error);
    expect(h.refetchSessionDiffs).not.toHaveBeenCalled();
  });

  it('rejects all diffs only after confirmation', async () => {
    const h = makeActions({ confirmReject: () => true });

    await h.actions.rejectAllDiffs();

    expect(h.rejectSessionDiffs).toHaveBeenCalledWith('s1');
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'info',
      title: 'Diffs rejected',
      body: '1 file',
      duration: 3000,
    });
    expect(h.refetchSessionDiffs).toHaveBeenCalledOnce();
  });

  it('does not reject when the user cancels confirmation', async () => {
    const h = makeActions({ confirmReject: () => false });

    await h.actions.rejectAllDiffs();

    expect(h.rejectSessionDiffs).not.toHaveBeenCalled();
    expect(h.toastPush).not.toHaveBeenCalled();
  });

  it('does nothing without an active session', async () => {
    const h = makeActions({ activeId: '' });

    await h.actions.applyAllDiffs();
    await h.actions.rejectAllDiffs();

    expect(h.applySessionDiffs).not.toHaveBeenCalled();
    expect(h.rejectSessionDiffs).not.toHaveBeenCalled();
  });
});
