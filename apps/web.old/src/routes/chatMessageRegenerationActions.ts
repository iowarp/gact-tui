/**
 * Action factory for regenerating an assistant message/turn. Exports
 * {@link createChatMessageRegenerationActions}.
 */
import type { Message } from '@clio/core';
import type { ModelOption } from '../components/ComposerTypes.js';
import type { ChatMessageActionsOptions } from './chatMessageActions.js';

export function createChatMessageRegenerationActions(options: ChatMessageActionsOptions) {
  async function regenerateMessage(msg: Message) {
    const id = options.activeId();
    if (!id || !ensureNotStreaming(options)) return;
    options.toastPush({
      tone: 'info',
      title: 'Regenerating',
      body: 'Re-running this turn…',
      duration: 2200,
    });
    try {
      await options.client.retryTurn(id, msg.id, { execute: true });
    } catch (error) {
      options.failToast('Regenerate failed', error, () => void regenerateMessage(msg));
    }
  }

  async function regenerateWithNotes(msg: Message, notes: string) {
    const id = options.activeId();
    if (!id || !ensureNotStreaming(options)) return;
    options.toastPush({
      tone: 'info',
      title: 'Regenerating with notes',
      body: notes.length > 96 ? notes.slice(0, 93) + '…' : notes,
      duration: 2500,
    });
    try {
      await options.client.retryTurn(id, msg.id, { execute: true, notes });
    } catch (error) {
      options.failToast('Regenerate failed', error, () => void regenerateWithNotes(msg, notes));
    }
  }

  async function regenerateWithModel(msg: Message, model: ModelOption) {
    const id = options.activeId();
    if (!id || !ensureNotStreaming(options)) return;
    options.toastPush({
      tone: 'info',
      title: `Regenerating with ${model.modelId}`,
      body: `via ${model.providerLabel}`,
      duration: 2500,
    });
    try {
      await options.client.retryTurn(id, msg.id, {
        execute: true,
        provider_id: model.providerId,
        model_id: model.modelId,
      });
    } catch (error) {
      options.failToast('Regenerate failed', error, () => void regenerateWithModel(msg, model));
    }
  }

  return {
    regenerateMessage,
    regenerateWithNotes,
    regenerateWithModel,
  };
}

function ensureNotStreaming(options: ChatMessageActionsOptions): boolean {
  if (!options.streaming()) return true;
  options.toastPush({
    tone: 'warn',
    title: 'Already streaming',
    body: 'Wait for the current turn to finish before regenerating.',
    duration: 2500,
  });
  return false;
}
