import { describe, expect, it, vi } from 'vitest';
import type { ContextFileContent } from '@clio/core';
import { createChatSessionContextFileActions } from '../../src/routes/chatSessionContextFileActions.js';

function makeActions(overrides: {
  activeId?: string;
  activeWorkspaceId?: string;
  addContextFile?: ReturnType<typeof vi.fn>;
  patchContextFile?: ReturnType<typeof vi.fn>;
  readWorkspaceFile?: ReturnType<typeof vi.fn>;
  removeContextFile?: ReturnType<typeof vi.fn>;
} = {}) {
  const toastPush = vi.fn();
  const failToast = vi.fn();
  const refetchContextFiles = vi.fn();
  const content: ContextFileContent = {
    path: 'src/a.ts',
    size: 5,
    media_type: 'text/plain',
    encoding: 'base64',
    data: 'aGVsbG8=',
  };
  const addContextFile = overrides.addContextFile ?? vi.fn().mockResolvedValue(undefined);
  const patchContextFile = overrides.patchContextFile ?? vi.fn().mockResolvedValue(undefined);
  const readWorkspaceFile = overrides.readWorkspaceFile ?? vi.fn().mockResolvedValue(content);
  const removeContextFile = overrides.removeContextFile ?? vi.fn().mockResolvedValue(undefined);
  const actions = createChatSessionContextFileActions({
    activeId: () => overrides.activeId ?? 's1',
    activeWorkspaceId: () =>
      Object.hasOwn(overrides, 'activeWorkspaceId') ? overrides.activeWorkspaceId : 'w1',
    client: {
      addContextFile,
      patchContextFile,
      readWorkspaceFile,
      removeContextFile,
    },
    toastPush,
    failToast,
    refetchContextFiles,
  });
  return {
    actions,
    addContextFile,
    patchContextFile,
    readWorkspaceFile,
    removeContextFile,
    toastPush,
    failToast,
    refetchContextFiles,
    content,
  };
}

describe('createChatSessionContextFileActions', () => {
  it('previews context files through the active workspace', async () => {
    const h = makeActions();

    await expect(h.actions.previewContextFile('src/a.ts')).resolves.toBe(h.content);

    expect(h.readWorkspaceFile).toHaveBeenCalledWith('w1', 'src/a.ts');
  });

  it('rejects preview requests without an active workspace', async () => {
    const h = makeActions({ activeWorkspaceId: undefined });

    await expect(h.actions.previewContextFile('src/a.ts')).rejects.toThrow(
      'no workspace for active session',
    );
    expect(h.readWorkspaceFile).not.toHaveBeenCalled();
  });

  it('pins a file to context and refetches context files', async () => {
    const h = makeActions();

    await h.actions.pinFileToContext('src/a.ts');

    expect(h.addContextFile).toHaveBeenCalledWith('s1', { path: 'src/a.ts', mode: 'read' });
    expect(h.refetchContextFiles).toHaveBeenCalledOnce();
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'success',
      title: 'Pinned to context',
      body: 'src/a.ts',
      duration: 2400,
    });
  });

  it('removes a context file and refetches context files', async () => {
    const h = makeActions();

    await h.actions.removeContextFile('src/a.ts');

    expect(h.removeContextFile).toHaveBeenCalledWith('s1', 'src/a.ts');
    expect(h.refetchContextFiles).toHaveBeenCalledOnce();
    expect(h.toastPush).toHaveBeenCalledWith({
      tone: 'success',
      title: 'Removed from context',
      body: 'src/a.ts',
      duration: 2200,
    });
  });

  it('cycles context file mode', async () => {
    const h = makeActions();

    await h.actions.cycleContextFileMode('src/a.ts', 'edit');

    expect(h.patchContextFile).toHaveBeenCalledWith('s1', {
      path: 'src/a.ts',
      mode: 'edit',
    });
    expect(h.refetchContextFiles).toHaveBeenCalledOnce();
  });

  it('does nothing without an active session', async () => {
    const h = makeActions({ activeId: '' });

    await h.actions.pinFileToContext('src/a.ts');
    await h.actions.removeContextFile('src/a.ts');
    await h.actions.cycleContextFileMode('src/a.ts', 'pin');

    expect(h.addContextFile).not.toHaveBeenCalled();
    expect(h.removeContextFile).not.toHaveBeenCalled();
    expect(h.patchContextFile).not.toHaveBeenCalled();
  });

  it('surfaces context action failures through failToast', async () => {
    const error = new Error('denied');
    const h = makeActions({ addContextFile: vi.fn().mockRejectedValue(error) });

    await h.actions.pinFileToContext('src/a.ts');

    expect(h.failToast).toHaveBeenCalledWith('Pin failed', error, expect.any(Function));
    expect(h.refetchContextFiles).not.toHaveBeenCalled();
  });
});
