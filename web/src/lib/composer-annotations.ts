import type { SelectionTarget } from './selection-actions';

/**
 * Something the person pointed at and attached to their next message: a quoted
 * run of an agent answer today; a region of an image, a range of a document, or
 * a node of an interactive surface later (one member per selection kind).
 *
 * Annotations travel as part of the message text, so the service needs no new
 * message part to receive them and the transcript shows exactly what was sent.
 */
export interface ComposerAnnotation {
  id: string;
  kind: 'text-quote';
  /** The quoted text, verbatim. */
  text: string;
  /** Where it was selected (session and message), kept for navigation. */
  sessionId: string;
  messageId: string;
}

let sequence = 0;

/** Turn a selection into the annotation "Add to chat" attaches. */
export function annotationFromSelection(target: SelectionTarget): ComposerAnnotation {
  sequence += 1;
  return {
    id: `annotation-${Date.now().toString(36)}-${sequence}`,
    kind: 'text-quote',
    text: target.text,
    sessionId: target.sessionId,
    messageId: target.messageId,
  };
}

function quoted(text: string): string {
  return text
    .split(/\r?\n/u)
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');
}

/**
 * The message text a submission carries: every annotation as a Markdown
 * blockquote, in the order they were added, then what the person wrote.
 */
export function messageTextWithAnnotations(
  annotations: readonly ComposerAnnotation[],
  text: string,
): string {
  if (!annotations.length) return text;
  const quotes = annotations.map((annotation) => quoted(annotation.text)).join('\n\n');
  return text ? `${quotes}\n\n${text}` : quotes;
}
