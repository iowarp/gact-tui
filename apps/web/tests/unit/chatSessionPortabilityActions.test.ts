import { describe, expect, it, vi } from 'vitest';
import { createChatSessionPortabilityActions } from '../../src/routes/chatSessionPortabilityActions.js';

function makeActions(overrides: {
  exportSession?: ReturnType<typeof vi.fn>;
  forkSession?: ReturnType<typeof vi.fn>;
  importSession?: ReturnType<typeof vi.fn>;
  shareSession?: ReturnType<typeof vi.fn>;
} = {}) {
  const setActiveId = vi.fn();
  const refetchSessions = vi.fn();
  const toastPush = vi.fn();
  const failToast = vi.fn();
  const createObjectUrl = vi.fn(() => 'blob:test');
  const revokeObjectUrl = vi.fn();
  const appendDownloadAnchor = vi.fn();
  const clickDownloadAnchor = vi.fn();
  const removeDownloadAnchor = vi.fn();
  const writeClipboard = vi.fn().mockResolvedValue(undefined);
  const exportSession = overrides.exportSession ?? vi.fn().mockResolvedValue({ session: { title: 'T' }, messages: [] });
  const forkSession = overrides.forkSession ?? vi.fn().mockResolvedValue({ id: 'fork1', title: 'Forked' });
  const importSession = overrides.importSession ?? vi.fn().mockResolvedValue({ id: 'new1', title: 'Imported' });
  const shareSession = overrides.shareSession ?? vi.fn().mockResolvedValue({ token: 'tok1' });
  const actions = createChatSessionPortabilityActions({
    client: { exportSession, forkSession, importSession, shareSession },
    backendUrl: 'http://localhost:17800',
    rows: () => [{ id: 's1', title: 'Original', status: 'idle', updatedAt: 'now' }],
    setActiveId,
    refetchSessions,
    toastPush,
    failToast,
    createObjectUrl,
    revokeObjectUrl,
    appendDownloadAnchor,
    clickDownloadAnchor,
    removeDownloadAnchor,
    writeClipboard,
  });
  return {
    actions,
    exportSession,
    forkSession,
    importSession,
    shareSession,
    setActiveId,
    refetchSessions,
    toastPush,
    failToast,
    createObjectUrl,
    revokeObjectUrl,
    appendDownloadAnchor,
    clickDownloadAnchor,
    removeDownloadAnchor,
    writeClipboard,
  };
}

describe('createChatSessionPortabilityActions', () => {
  it('imports a session, refreshes sessions, and activates the new session', async () => {
    const h = makeActions();

    await h.actions.importSession({ session: {} });

    expect(h.importSession).toHaveBeenCalledWith({ session: {} });
    expect(h.refetchSessions).toHaveBeenCalledOnce();
    expect(h.setActiveId).toHaveBeenCalledWith('new1');
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'success',
      title: 'Session imported',
      body: 'Imported',
      duration: 3000,
    });
  });

  it('exports a session as markdown through a download anchor', async () => {
    const h = makeActions();

    await h.actions.exportSession('s1', 'md');

    expect(h.exportSession).toHaveBeenCalledWith('s1');
    expect(h.createObjectUrl).toHaveBeenCalledOnce();
    expect(h.appendDownloadAnchor).toHaveBeenCalledOnce();
    expect(h.clickDownloadAnchor).toHaveBeenCalledOnce();
    expect(h.removeDownloadAnchor).toHaveBeenCalledOnce();
    expect(h.revokeObjectUrl).toHaveBeenCalledWith('blob:test');
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'success',
      title: 'Session exported',
      body: 'clio-session-s1.md',
      duration: 3000,
    });
  });

  it('shares a session using a backend-provided or derived URL', async () => {
    const h = makeActions();

    await h.actions.shareSession('s1');

    expect(h.shareSession).toHaveBeenCalledWith('s1');
    expect(h.writeClipboard).toHaveBeenCalledWith('http://localhost:17800/v1/shared/tok1');
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'success',
      title: 'Share link copied',
      body: 'http://localhost:17800/v1/shared/tok1',
      duration: 5000,
    });
  });

  it('forks a session using the current row title', async () => {
    const h = makeActions();

    await h.actions.forkSession('s1');

    expect(h.forkSession).toHaveBeenCalledWith('s1', { title: 'Fork of Original' });
    expect(h.refetchSessions).toHaveBeenCalledOnce();
    expect(h.setActiveId).toHaveBeenCalledWith('fork1');
  });

  it('reports portability failures with retry callbacks', async () => {
    const error = new Error('denied');
    const h = makeActions({ shareSession: vi.fn().mockRejectedValue(error) });

    await h.actions.shareSession('s1');

    expect(h.failToast).toHaveBeenCalledWith('Share failed', error, expect.any(Function));
  });
});
