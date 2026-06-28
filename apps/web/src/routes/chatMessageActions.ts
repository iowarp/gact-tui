/**
 * Action factory for per-message operations (copy, delete, edit, retry) in
 * the transcript. Exports {@link createChatMessageActions}.
 */
import type { Client, Message } from '@clio/core';
import type { ModelOption } from '../components/ComposerTypes.js';
import type { ToastInput } from '../components/Toast.js';
import { createChatMessageRegenerationActions } from './chatMessageRegenerationActions.js';
import { messageToText } from './chatSessionMarkdown.js';

export interface ChatMessageActionsOptions {
  activeId: () => string;
  streaming: () => boolean;
  client: Client;
  refetchTranscript: () => Promise<unknown>;
  toastPush: (input: ToastInput) => number;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
}

export interface ChatMessageActions {
  copyMessageToClipboard: (msg: Message) => void;
  regenerateMessage: (msg: Message) => Promise<void>;
  regenerateWithNotes: (msg: Message, notes: string) => Promise<void>;
  regenerateWithModel: (msg: Message, model: ModelOption) => Promise<void>;
  quoteMessage: (msg: Message) => void;
  deleteMessage: (msg: Message) => Promise<void>;
  editMessage: (msg: Message) => void;
  copyMessagePermalink: (msg: Message) => Promise<void>;
  speakMessage: (msg: Message) => Promise<void>;
}

export function createChatMessageActions(options: ChatMessageActionsOptions): ChatMessageActions {
  const regenerationActions = createChatMessageRegenerationActions(options);

  function copyMessageToClipboard(msg: Message) {
    const text = messageToText(msg);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
  }

  function quoteMessage(msg: Message) {
    const text = messageToText(msg);
    if (!text) return;
    const quoted = text
      .split('\n')
      .map((line) => '> ' + line)
      .join('\n');
    const ta = composerInput();
    if (!ta) return;
    const cur = ta.value;
    const prefix = cur && !cur.endsWith('\n') ? cur + '\n\n' : cur;
    ta.value = prefix + quoted + '\n\n';
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.scrollTop = ta.scrollHeight;
  }

  async function deleteMessage(msg: Message) {
    const id = options.activeId();
    if (!id) return;
    try {
      await options.client.deleteMessage(id, msg.id);
      await options.refetchTranscript();
      options.toastPush({
        tone: 'success',
        title: 'Message deleted',
        duration: 2200,
      });
    } catch (error) {
      options.failToast('Delete failed', error, () => void deleteMessage(msg));
    }
  }

  function editMessage(msg: Message) {
    const textPart = msg.parts.find((part) => part.type === 'text');
    const text = textPart && textPart.type === 'text' ? textPart.text : '';
    const ta = composerInput();
    if (ta && text) {
      ta.value = text;
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function copyMessagePermalink(msg: Message) {
    const sid = options.activeId();
    if (!sid) return;
    const link = `clio://session/${sid}#${msg.id}`;
    try {
      await navigator.clipboard.writeText(link);
      options.toastPush({
        tone: 'success',
        title: 'Link copied',
        body: link,
        duration: 2500,
      });
    } catch {
      /* clipboard blocked - ignore */
    }
  }

  async function speakMessage(msg: Message) {
    const sid = options.activeId();
    if (!sid) return;
    const text = messageToText(msg).slice(0, 4000);
    if (!text.trim()) return;
    try {
      const blob = await options.client.synthesizeVoice(sid, text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener('ended', () => URL.revokeObjectURL(url));
      await audio.play();
    } catch (error) {
      options.failToast('TTS failed', error, () => void speakMessage(msg));
    }
  }

  return {
    copyMessageToClipboard,
    regenerateMessage: regenerationActions.regenerateMessage,
    regenerateWithNotes: regenerationActions.regenerateWithNotes,
    regenerateWithModel: regenerationActions.regenerateWithModel,
    quoteMessage,
    deleteMessage,
    editMessage,
    copyMessagePermalink,
    speakMessage,
  };
}

function composerInput(): HTMLTextAreaElement | null {
  return document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement | null;
}
