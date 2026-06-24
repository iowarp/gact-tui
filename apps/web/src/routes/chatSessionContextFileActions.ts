/**
 * Action factory for managing a session's context files (add/remove/preview).
 * Exports {@link createChatSessionContextFileActions}.
 */
import type { Accessor } from 'solid-js';
import type { Client, ContextFileContent } from '@clio/core';
import type { ToastInput } from '../components/Toast.js';

export interface ChatSessionContextFileActionsOptions {
  activeId: Accessor<string>;
  activeWorkspaceId: Accessor<string | undefined>;
  client: Pick<
    Client,
    'addContextFile' | 'patchContextFile' | 'readWorkspaceFile' | 'removeContextFile'
  >;
  toastPush: (input: ToastInput) => number;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
  refetchContextFiles: () => unknown;
}

export function createChatSessionContextFileActions(
  options: ChatSessionContextFileActionsOptions,
) {
  function previewContextFile(path: string): Promise<ContextFileContent> {
    const workspaceId = options.activeWorkspaceId();
    if (!workspaceId) return Promise.reject(new Error('no workspace for active session'));
    return options.client.readWorkspaceFile(workspaceId, path);
  }

  async function pinFileToContext(path: string) {
    const sid = options.activeId();
    if (!sid) return;
    try {
      await options.client.addContextFile(sid, { path, mode: 'read' });
      void options.refetchContextFiles();
      options.toastPush({
        tone: 'success',
        title: 'Pinned to context',
        body: path,
        duration: 2400,
      });
    } catch (error) {
      options.failToast('Pin failed', error, () => void pinFileToContext(path));
    }
  }

  async function removeContextFile(path: string) {
    const sid = options.activeId();
    if (!sid) return;
    try {
      await options.client.removeContextFile(sid, path);
      void options.refetchContextFiles();
      options.toastPush({
        tone: 'success',
        title: 'Removed from context',
        body: path,
        duration: 2200,
      });
    } catch (error) {
      options.failToast('Remove failed', error, () => void removeContextFile(path));
    }
  }

  async function cycleContextFileMode(path: string, next: 'read' | 'edit' | 'pin') {
    const sid = options.activeId();
    if (!sid) return;
    try {
      await options.client.patchContextFile(sid, { path, mode: next });
      void options.refetchContextFiles();
    } catch (error) {
      options.failToast('Mode change failed', error, () => void cycleContextFileMode(path, next));
    }
  }

  return {
    previewContextFile,
    pinFileToContext,
    removeContextFile,
    cycleContextFileMode,
  };
}
