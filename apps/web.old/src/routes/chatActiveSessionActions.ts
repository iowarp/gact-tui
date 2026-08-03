/**
 * Action factory for operations on the active session (the currently open
 * conversation), composed into the ChatLayout command surface.
 */
import type { Client } from '@clio/core';
import type { ToastInput } from '../components/Toast.js';

type PromptText = (message: string) => string | null;

export interface ChatActiveSessionActionsOptions {
  activeId: () => string;
  client: Pick<
    Client,
    'compactSession' | 'extractAgent' | 'runCommand' | 'summarizeSession' | 'undoSession'
  >;
  refetchTranscript: () => Promise<unknown>;
  toastPush: (input: ToastInput) => number;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
  brandName: string;
  confirmUndo?: (message: string) => boolean;
  promptText?: PromptText;
}

export function createChatActiveSessionActions(options: ChatActiveSessionActionsOptions) {
  const confirmUndo = options.confirmUndo ?? ((message: string) => confirm(message));
  const promptText = options.promptText ?? ((message: string) => prompt(message));

  async function compactActive() {
    const id = options.activeId();
    if (!id) return;
    try {
      await options.client.compactSession(id);
      options.toastPush({
        tone: 'info',
        title: 'Compacting…',
        body: 'Backend will emit session.compacted when done.',
        duration: 3000,
      });
    } catch (error) {
      options.failToast('Compact failed', error, () => void compactActive());
    }
  }

  async function undoActive() {
    const id = options.activeId();
    if (!id) return;
    if (!confirmUndo('Drop the last message from this session?')) return;
    try {
      await options.client.undoSession(id, { count: 1 });
      await options.refetchTranscript();
      options.toastPush({
        tone: 'success',
        title: 'Last message dropped',
        duration: 2200,
      });
    } catch (error) {
      options.failToast('Undo failed', error, () => void undoActive());
    }
  }

  async function summarizeActive() {
    const id = options.activeId();
    if (!id) return;
    try {
      await options.client.summarizeSession(id, { auto: true });
      options.toastPush({
        tone: 'info',
        title: 'Summarizing...',
        body: 'The backend will emit a session.summarized event when done.',
        duration: 3000,
      });
    } catch (error) {
      options.failToast('Summarize failed', error, () => void summarizeActive());
    }
  }

  async function summarizeActiveWithInstructions() {
    const id = options.activeId();
    if (!id) return;
    const instructions = promptText(
      `How should ${options.brandName} summarize the session? (e.g. "tldr in 5 sentences", "extract action items only")`,
    );
    if (!instructions) return;
    try {
      await options.client.summarizeSession(id, { auto: false, instructions });
      options.toastPush({
        tone: 'info',
        title: 'Summarization requested',
        body: 'session.summarized will fire when done.',
        duration: 3500,
      });
    } catch (error) {
      options.failToast('Summarize failed', error);
    }
  }

  async function extractAgent() {
    const id = options.activeId();
    if (!id) return;
    const name = promptText('Name for the extracted agent (optional)') ?? undefined;
    const description = promptText('One-line description (optional)') ?? undefined;
    try {
      const created = await options.client.extractAgent({
        session_id: id,
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
      });
      options.toastPush({
        tone: 'success',
        title: 'Agent extracted',
        body: `New definition saved — id ${(created as { id?: string }).id ?? '?'}`,
        duration: 4000,
      });
    } catch (error) {
      options.failToast('Extract failed', error);
    }
  }

  function runCommand(commandId: string, args: Record<string, unknown>) {
    const sessionId = options.activeId();
    if (!sessionId) return Promise.reject(new Error('no active session'));
    return options.client.runCommand(sessionId, commandId, args);
  }

  return {
    compactActive,
    undoActive,
    summarizeActive,
    summarizeActiveWithInstructions,
    extractAgent,
    runCommand,
  };
}
