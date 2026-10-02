import type { SelectionTarget } from './selection-actions';

/**
 * Something the person pointed at and attached to their next message: a quoted
 * run of an agent answer, or a chart/map/table zone, today; a region of an
 * image or a range of a document later (one member per selection kind).
 *
 * Annotations travel as part of the message text, so the service needs no new
 * message part to receive them and the transcript shows exactly what was sent.
 */
export type ComposerAnnotation = TextQuoteAnnotation | DataZoneQuoteAnnotation | RegionCaptureAnnotation;

export interface TextQuoteAnnotation {
  id: string;
  kind: 'text-quote';
  /** The quoted text, verbatim. */
  text: string;
  /** Where it was selected (session and message), kept for navigation. */
  sessionId: string;
  messageId: string;
}

/** A "Reference this" attachment from a chart/map/table zone (#1533 item 5). */
export interface DataZoneQuoteAnnotation {
  id: string;
  kind: 'data-zone-quote';
  /** Short label for the card, e.g. "Depth vs. magnitude chart". */
  title: string;
  /** One plain-language line for the card itself, e.g. "the whole view (500 rows)". */
  summary: string;
  /** The full reference block — see `data-zone-reference.ts`'s `buildZoneReference`. */
  markdown: string;
}

/** A labelled surface screenshot with its structured context kept out of the editable draft. */
export interface RegionCaptureAnnotation {
  id: string;
  kind: 'region-capture';
  filename: string;
  title: string;
  summary: string;
  markdown: string;
}

let sequence = 0;

/** Turn a selection into the annotation "Add to chat" / "Reference this" attaches. */
export function annotationFromSelection(target: SelectionTarget): ComposerAnnotation {
  sequence += 1;
  const id = `annotation-${Date.now().toString(36)}-${sequence}`;
  if (target.kind === 'data-surface-zone') {
    return {
      id,
      kind: 'data-zone-quote',
      markdown: target.markdown,
      summary: target.summary,
      title: target.title,
    };
  }
  return { id, kind: 'text-quote', messageId: target.messageId, sessionId: target.sessionId, text: target.text };
}

function quoted(text: string): string {
  return text
    .split(/\r?\n/u)
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');
}

/** The Markdown a submission quotes for one annotation, whatever its kind. */
function annotationBody(annotation: ComposerAnnotation): string {
  return annotation.kind === 'text-quote' ? annotation.text : annotation.markdown;
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
  const quotes = annotations.map((annotation) => quoted(annotationBody(annotation))).join('\n\n');
  return text ? `${quotes}\n\n${text}` : quotes;
}
