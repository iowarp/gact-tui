import type { ComposerMessagePart, WorkspaceReference } from '@clio/core/v3';

export type ReferencePart = Exclude<ComposerMessagePart, { type: 'text' }>;

/**
 * One reference the person put in a draft, and where it sits in the draft text.
 *
 * The offset is a plain-text character offset, so the inline editor can place
 * the token back at the same point in the prose after any re-render, and the
 * draft's owner can hold the selection across a composer remount.
 */
export interface InlineReferenceSelection {
  offset: number;
  reference: WorkspaceReference;
}

export function referenceIdentity(part: ReferencePart): string {
  return part.type === 'resource_ref'
    ? `resource:${part.resource_id}:${part.resource_revision}`
    : `${part.ref_kind}:${part.ref_id}:${part.revision ?? ''}`;
}

export function referenceLabel(part: ReferencePart): string {
  return part.type === 'resource_ref' ? part.name : part.label;
}

export function workspaceReferenceIdentity(reference: WorkspaceReference): string {
  return `${reference.kind}:${reference.id}:${reference.revision}`;
}

/**
 * How each reference kind is named to a reader.
 *
 * The wire names a reference by its protocol kind (`workspace_file`,
 * `evidence_source`). Those are internal vocabulary, so every surface that
 * shows a kind — the inline token, the transcript card, a refusal — reads it
 * through here rather than humanising the token on its own.
 */
const REFERENCE_KIND_LABELS: Record<string, string> = {
  agent_run: 'agent run',
  artifact: 'artifact',
  context_frame: 'context record',
  diff: 'changed file',
  evidence_source: 'source',
  plan: 'plan',
  resource: 'source',
  session: 'conversation',
  workspace_file: 'local file',
};

/** The reader-facing name for a reference kind, including one this build does not know. */
export function referenceKindLabel(kind: string): string {
  return REFERENCE_KIND_LABELS[kind] ?? kind.replaceAll('_', ' ');
}

export function toMessagePart(reference: WorkspaceReference): ReferencePart {
  if (reference.kind === 'unknown') {
    // Unreachable from the composer, which never offers a reference whose kind
    // this build has no wire mapping for. Explicit so a future caller gets a
    // refusal instead of an invalid ref_kind on the wire.
    throw new Error('This version cannot send a reference of an unrecognized kind.');
  }
  if (reference.kind === 'resource') {
    return {
      type: 'resource_ref',
      resource_id: reference.id,
      resource_revision: reference.revision,
      name: reference.label,
    };
  }
  return {
    type: 'context_ref',
    ref_kind: reference.kind,
    ref_id: reference.id,
    label: reference.label,
    revision: reference.revision || undefined,
  };
}
