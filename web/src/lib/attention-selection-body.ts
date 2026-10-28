import type { AgentAnswerTextSelection } from '@/lib/selection-actions';

/** The selected answer span as the attention routes take it (rendered text plus exact coordinates). */
export function attentionSelectionBody(target: AgentAnswerTextSelection): {
  text: string;
  part_id?: string;
  content_revision?: string;
  field?: string;
  start?: number;
  end?: number;
} {
  return {
    text: target.text,
    ...(target.partId ? { part_id: target.partId } : {}),
    ...(target.contentRevision ? { content_revision: target.contentRevision } : {}),
    ...(target.reference?.selection.kind === 'text'
      ? {
          start: target.reference.selection.start,
          end: target.reference.selection.end,
          field: target.reference.field,
        }
      : {}),
  };
}
