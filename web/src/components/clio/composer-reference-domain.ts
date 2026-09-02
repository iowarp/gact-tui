import type { ComposerMessagePart, WorkspaceReference } from '@clio/core/v3';

export type ReferencePart = Exclude<ComposerMessagePart, { type: 'text' }>;

export function referenceIdentity(part: ReferencePart): string {
  return part.type === 'resource_ref'
    ? `resource:${part.resource_id}:${part.resource_revision}`
    : `${part.ref_kind}:${part.ref_id}:${part.revision ?? ''}`;
}

export function referenceLabel(part: ReferencePart): string {
  return part.type === 'resource_ref' ? part.name : part.label;
}

export function toMessagePart(reference: WorkspaceReference): ReferencePart {
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
