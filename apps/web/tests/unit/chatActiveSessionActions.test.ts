import { describe, expect, it, vi } from 'vitest';
import { createChatActiveSessionActions } from '../../src/routes/chatActiveSessionActions.js';

function makeActions(overrides: {
  activeId?: string;
  compactSession?: ReturnType<typeof vi.fn>;
  extractAgent?: ReturnType<typeof vi.fn>;
  runCommand?: ReturnType<typeof vi.fn>;
  summarizeSession?: ReturnType<typeof vi.fn>;
  undoSession?: ReturnType<typeof vi.fn>;
  confirmUndo?: (message: string) => boolean;
  promptText?: (message: string) => string | null;
} = {}) {
  const toastPush = vi.fn();
  const failToast = vi.fn();
  const refetchTranscript = vi.fn().mockResolvedValue(undefined);
  const compactSession = overrides.compactSession ?? vi.fn().mockResolvedValue(undefined);
  const extractAgent =
    overrides.extractAgent ?? vi.fn().mockResolvedValue({ id: 'agent1' });
  const runCommand = overrides.runCommand ?? vi.fn().mockResolvedValue({ ok: true });
  const summarizeSession =
    overrides.summarizeSession ?? vi.fn().mockResolvedValue(undefined);
  const undoSession = overrides.undoSession ?? vi.fn().mockResolvedValue(undefined);
  const actions = createChatActiveSessionActions({
    activeId: () => overrides.activeId ?? 's1',
    client: {
      compactSession,
      extractAgent,
      runCommand,
      summarizeSession,
      undoSession,
    },
    refetchTranscript,
    toastPush,
    failToast,
    brandName: 'Clio',
    confirmUndo: overrides.confirmUndo,
    promptText: overrides.promptText,
  });
  return {
    actions,
    compactSession,
    extractAgent,
    runCommand,
    summarizeSession,
    undoSession,
    toastPush,
    failToast,
    refetchTranscript,
  };
}

describe('createChatActiveSessionActions', () => {
  it('compacts the active session and reports progress', async () => {
    const h = makeActions();

    await h.actions.compactActive();

    expect(h.compactSession).toHaveBeenCalledWith('s1');
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'info',
      title: 'Compacting…',
      body: 'Backend will emit session.compacted when done.',
      duration: 3000,
    });
  });

  it('undoes the last turn after confirmation', async () => {
    const h = makeActions({ confirmUndo: () => true });

    await h.actions.undoActive();

    expect(h.undoSession).toHaveBeenCalledWith('s1', { count: 1 });
    expect(h.refetchTranscript).toHaveBeenCalledOnce();
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'success',
      title: 'Last message dropped',
      duration: 2200,
    });
  });

  it('does not undo when confirmation is cancelled', async () => {
    const h = makeActions({ confirmUndo: () => false });

    await h.actions.undoActive();

    expect(h.undoSession).not.toHaveBeenCalled();
    expect(h.refetchTranscript).not.toHaveBeenCalled();
  });

  it('summarizes automatically and with instructions', async () => {
    const h = makeActions({ promptText: () => 'action items only' });

    await h.actions.summarizeActive();
    await h.actions.summarizeActiveWithInstructions();

    expect(h.summarizeSession).toHaveBeenNthCalledWith(1, 's1', { auto: true });
    expect(h.summarizeSession).toHaveBeenNthCalledWith(2, 's1', {
      auto: false,
      instructions: 'action items only',
    });
  });

  it('extracts an agent with optional prompts', async () => {
    const h = makeActions({
      promptText: vi.fn().mockReturnValueOnce('Agent Name').mockReturnValueOnce('Description'),
    });

    await h.actions.extractAgent();

    expect(h.extractAgent).toHaveBeenCalledWith({
      session_id: 's1',
      name: 'Agent Name',
      description: 'Description',
    });
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'success',
      title: 'Agent extracted',
      body: 'New definition saved — id agent1',
      duration: 4000,
    });
  });

  it('runs commands for the active session and rejects without one', async () => {
    const h = makeActions();

    await expect(h.actions.runCommand('cmd', { x: 1 })).resolves.toEqual({ ok: true });
    expect(h.runCommand).toHaveBeenCalledWith('s1', 'cmd', { x: 1 });

    await expect(makeActions({ activeId: '' }).actions.runCommand('cmd', {})).rejects.toThrow(
      'no active session',
    );
  });

  it('does nothing without an active session', async () => {
    const h = makeActions({ activeId: '' });

    await h.actions.compactActive();
    await h.actions.summarizeActive();

    expect(h.compactSession).not.toHaveBeenCalled();
    expect(h.summarizeSession).not.toHaveBeenCalled();
  });
});
