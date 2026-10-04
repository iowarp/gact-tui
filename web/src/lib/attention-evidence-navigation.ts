import { toast } from 'sonner';
import { findPartElement } from './attention-highlight-dom';
import { attentionProfileSchema, contentSelectionSchema } from '@clio/core/v3';
import { z } from 'zod';

const inspectionSchema = z.object({
  schema_version: z.literal(1),
  selections: z.array(contentSelectionSchema).min(1).max(32),
  direction: z.enum(['generated_to_source', 'source_to_generation']),
  profile: attentionProfileSchema,
  profile_revision: z.string().min(1),
  lm_call_id: z.string().min(1),
  capture_sha256: z.string().min(1),
});
export type AttentionEvidenceInspection = z.infer<typeof inspectionSchema>;

/** A finding link can restore only this session's validated, revision-bound inspection. */
export function readAttentionEvidence(
  hash: string,
  sessionId: string,
): AttentionEvidenceInspection | undefined {
  const query = new URLSearchParams(hash.split('?')[1]);
  const raw = query.get('inspection');
  if (!raw || raw.length > 65536) return;
  try {
    const parsed = inspectionSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.selections.every((ref) => ref.session_id === sessionId))
      return parsed.data;
  } catch {
    /* A malformed link cannot authorize a different inspection. */
  }
}

/** Revision identity travels with the link; the target never substitutes changed content. */
export function attentionEvidenceHash(
  reference: {
    message_id: string;
    part_id?: string;
    field?: string;
    content_revision?: string;
  },
  profileRevision: string,
  inspection?: AttentionEvidenceInspection,
): string {
  const query = new URLSearchParams({ profile: profileRevision });
  if (reference.part_id) query.set('part', reference.part_id);
  if (reference.field) query.set('field', reference.field);
  if (reference.content_revision) query.set('revision', reference.content_revision);
  if (inspection) query.set('inspection', JSON.stringify(inspection));
  return `#message-${encodeURIComponent(reference.message_id)}?${query}`;
}

/** Focus the exact mounted field, reporting changed/unavailable content explicitly. */
export function focusAttentionEvidence(messageId: string, query: URLSearchParams): boolean {
  const part = query.get('part');
  if (!part) return false;
  const target = findPartElement(document, messageId, part, query.get('field') ?? 'text');
  if (!(target instanceof HTMLElement)) {
    if (!query.has('inspection'))
      toast.info('Expand this message’s activity to inspect the referenced field.');
    return false;
  }
  const revision = query.get('revision');
  if (revision && target.dataset.contentRevision !== revision) {
    toast.error('This field is not displaying the referenced revision.');
    return false;
  }
  target.tabIndex = -1;
  target.scrollIntoView({ block: 'center' });
  target.focus({ preventScroll: true });
  return true;
}
