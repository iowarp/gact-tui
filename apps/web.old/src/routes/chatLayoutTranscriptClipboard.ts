/**
 * Transcript clipboard helpers: serialises the message feed to text for
 * copy-to-clipboard. Exports {@link copyTranscript}.
 */
import type { Message } from '@clio/core';
import { messageToText } from './chatSessionMarkdown.js';

function isDialogueMessage(message: Message): boolean {
  return message.role === 'user' || message.role === 'assistant';
}

export function copyTranscript(messages: Message[]) {
  const dialogueMessages = messages.filter(isDialogueMessage);
  const dialogue = dialogueMessages
    .map((message) => `### ${message.role.toUpperCase()}\n${messageToText(message)}`)
    .join('\n\n');
  if (!dialogue.trim() || typeof navigator === 'undefined' || !navigator.clipboard) return;

  void navigator.clipboard.writeText(dialogue).then(() => {
    window.dispatchEvent(
      new CustomEvent('clio:toast', {
        detail: {
          tone: 'success',
          title: 'Transcript copied',
          body: `${dialogueMessages.length} messages on the clipboard`,
          duration: 2400,
        },
      }),
    );
  });
}
