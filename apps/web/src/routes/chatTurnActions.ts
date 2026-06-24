/**
 * Action factory for turn-level operations (stop, retry, branch). Exports
 * {@link createChatTurnActions}.
 */
import type { Client, PermissionRequest, PermissionScope, UserQuestion } from '@clio/core';
import type { ToastInput } from '../components/Toast.js';
import type { SettingsSection } from './SettingsShell.js';

export interface ChatTurnActionsOptions {
  client: Client;
  activeId: () => string;
  createSessionWithSemantics: (title: string) => Promise<{ id: string }>;
  pendingPermission: () => PermissionRequest | null;
  clearPendingPermission: () => void;
  pendingQuestion: () => UserQuestion | null;
  refetchTranscript: () => Promise<unknown>;
  refetchSessions: () => void;
  toastPush: (input: ToastInput) => number;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
  onOpenSettings?: (section?: SettingsSection) => void;
}

export function createChatTurnActions(options: ChatTurnActionsOptions) {
  async function sendUserMessage(text: string) {
    let sessionId = options.activeId();
    if (!sessionId) {
      const created = await options.createSessionWithSemantics(text.slice(0, 60));
      sessionId = created.id;
    }
    try {
      await options.client.sendMessage(sessionId, { text });
      await options.refetchTranscript();
      options.refetchSessions();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isLmIssue = /lm_provider|provider|api_key|api_base|model/i.test(message);
      options.toastPush({
        tone: 'error',
        title: isLmIssue ? 'LM not configured' : 'Send failed',
        body: isLmIssue
          ? `${message} — pick a provider in Settings → Models & providers.`
          : message,
        duration: 8000,
        action: isLmIssue
          ? {
              label: 'Open model settings',
              onClick: () => options.onOpenSettings?.('providers'),
            }
          : {
              label: 'Retry',
              onClick: () => void sendUserMessage(text),
            },
      });
      throw error;
    }
  }

  async function decidePermission(decision: 'approve' | 'deny', scope?: PermissionScope) {
    const pending = options.pendingPermission();
    if (!pending) return;
    try {
      await options.client.resolvePermission(pending.id, decision, scope);
      options.clearPendingPermission();
    } catch (error) {
      console.error('resolvePermission failed', error);
    }
  }

  async function answerQuestion(body: { answer?: string; selected_options?: string[] }) {
    const question = options.pendingQuestion();
    const sessionId = options.activeId();
    if (!question || !sessionId) return;
    try {
      await options.client.answerSessionQuestion(sessionId, question.id, body);
      await options.refetchTranscript();
    } catch (error) {
      options.failToast('Answer failed', error, () => void answerQuestion(body));
    }
  }

  async function cancelQuestion() {
    const question = options.pendingQuestion();
    const sessionId = options.activeId();
    if (!question || !sessionId) return;
    try {
      await options.client.cancelSessionQuestion(sessionId, question.id);
    } catch (error) {
      options.failToast('Cancel failed', error, () => void cancelQuestion());
    }
  }

  async function stopRun() {
    const sessionId = options.activeId();
    if (!sessionId) return;
    try {
      await options.client.cancelSession(sessionId);
    } catch (error) {
      console.error('cancelSession failed', error);
    }
  }

  return {
    sendUserMessage,
    decidePermission,
    answerQuestion,
    cancelQuestion,
    stopRun,
  };
}
