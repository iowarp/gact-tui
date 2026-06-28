/**
 * Action factory for session-level operations (rename, pin, delete, fork).
 * Exports {@link createChatSessionActions}.
 */
import type { Client } from '@clio/core';
import type { SessionRow } from '../components/SessionsColumn.js';
import type { ToastInput } from '../components/Toast.js';
import { createChatActiveSessionActions } from './chatActiveSessionActions.js';
import { createChatSessionPortabilityActions } from './chatSessionPortabilityActions.js';

export interface ChatSessionActionsOptions {
  client: Client;
  backendUrl: string;
  activeId: () => string;
  setActiveId: (id: string) => void;
  rows: () => SessionRow[];
  refetchSessions: () => void;
  patchSessionRow: (id: string, patch: Partial<SessionRow>) => void;
  removeSessionRow: (id: string) => void;
  refetchTranscript: () => Promise<unknown>;
  toastPush: (input: ToastInput) => number;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
  brandName: string;
}

export function createChatSessionActions(options: ChatSessionActionsOptions) {
  const activeSessionActions = createChatActiveSessionActions({
    activeId: options.activeId,
    client: options.client,
    refetchTranscript: options.refetchTranscript,
    toastPush: options.toastPush,
    failToast: options.failToast,
    brandName: options.brandName,
  });

  const portabilityActions = createChatSessionPortabilityActions({
    client: options.client,
    backendUrl: options.backendUrl,
    rows: options.rows,
    setActiveId: options.setActiveId,
    refetchSessions: options.refetchSessions,
    toastPush: options.toastPush,
    failToast: options.failToast,
  });

  async function renameSession(id: string, nextTitle: string) {
    try {
      await options.client.patchSession(id, { title: nextTitle });
      options.patchSessionRow(id, { title: nextTitle });
    } catch (error) {
      options.failToast('Rename failed', error, () => void renameSession(id, nextTitle));
    }
  }

  async function deleteSession(id: string) {
    try {
      await options.client.deleteSession(id);
      options.removeSessionRow(id);
      if (options.activeId() === id) options.setActiveId('');
      try {
        localStorage.removeItem(`clio.draft.${id}`);
      } catch {
        /* ignore */
      }
      options.toastPush({ tone: 'success', title: 'Session deleted', duration: 2200 });
    } catch (error) {
      options.failToast('Delete failed', error, () => void deleteSession(id));
    }
  }

  return {
    importSession: portabilityActions.importSession,
    renameSession,
    deleteSession,
    exportSession: portabilityActions.exportSession,
    shareSession: portabilityActions.shareSession,
    compactActive: activeSessionActions.compactActive,
    undoActive: activeSessionActions.undoActive,
    summarizeActive: activeSessionActions.summarizeActive,
    summarizeActiveWithInstructions: activeSessionActions.summarizeActiveWithInstructions,
    extractAgent: activeSessionActions.extractAgent,
    forkSession: portabilityActions.forkSession,
    runCommand: activeSessionActions.runCommand,
  };
}
