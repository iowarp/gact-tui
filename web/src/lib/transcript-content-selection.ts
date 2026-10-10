import type { ContentSelection } from '@clio/core/v3';
import { projectText } from './attention-text';

interface BoundText {
  source: string;
  /** UTF-16 offset of the rendered portion within the complete recorded text. */
  sourceStart?: number;
  partId: string;
  revision: string;
  field: ContentSelection['field'];
  callId?: string;
}
const sources = new WeakMap<Element, BoundText>();

/** Bind source coordinates to the renderer without duplicating content in DOM attributes. */
export function bindTranscriptText(element: Element | null, source: BoundText | undefined) {
  if (!element) return;
  if (source) sources.set(element, source);
  else sources.delete(element);
}

/** Locate a rendered body within its original, unmodified message part. */
export function transcriptSourceStart(element: Element): number {
  return sources.get(element)?.sourceStart ?? 0;
}

/** Only an exact whole-render projection can establish which repeated occurrence was selected. */
export function transcriptContentSelection(
  selection: Selection | null,
): ContentSelection | undefined {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const element =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;
  const block = element?.closest('[data-content-revision]');
  if (!block || !block.contains(range.endContainer)) return;
  const bound = sources.get(block);
  const owner = block.closest<HTMLElement>('[data-session-id][data-message-id]');
  if (!bound || !owner?.dataset.sessionId || !owner.dataset.messageId) return;
  const before = range.cloneRange();
  before.selectNodeContents(block);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  const dom = projectText(block.textContent ?? '', { source: false });
  const sourceStart = bound.sourceStart ?? 0;
  const raw = projectText(bound.source.slice(sourceStart), { source: true });
  if (dom.text !== raw.text) return;
  const lo = dom.index.findIndex((offset) => offset >= start);
  const after = dom.index.findIndex((offset) => offset >= end);
  const hi = after < 0 ? dom.index.length : after;
  if (lo < 0 || hi <= lo) return;
  const projectedStart = raw.index[lo];
  const projectedLast = raw.index[hi - 1];
  if (projectedStart === undefined || projectedLast === undefined) return;
  const rawStart = sourceStart + projectedStart;
  const rawLast = sourceStart + projectedLast;
  // DOM and JS strings count UTF-16 units; the shared API uses Unicode points.
  const rawEnd = rawLast + 1;
  return {
    schema_version: 1,
    session_id: owner.dataset.sessionId,
    message_id: owner.dataset.messageId,
    part_id: bound.partId,
    field: bound.field,
    content_revision: bound.revision,
    ...(bound.callId ? { call_id: bound.callId } : {}),
    selection: {
      kind: 'text',
      start: [...bound.source.slice(0, rawStart)].length,
      end: [...bound.source.slice(0, rawEnd)].length,
    },
  };
}
