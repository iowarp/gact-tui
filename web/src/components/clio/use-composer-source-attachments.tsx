import type { WorkspaceReference } from '@clio/core/v3';
import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  workspaceReferenceIdentity,
  type InlineReferenceSelection,
} from '@/lib/composer-reference-domain';
import { SourceAttachmentCard } from './composer-source-attachments';
import { useSourceDraftLifecycle } from './use-source-draft-lifecycle';
import { toast } from 'sonner';

/** Source selections use the attachment tray while retaining ordinary resource message parts. */
export function isSourceAttachment(reference: WorkspaceReference) {
  return reference.kind === 'resource' && typeof reference.navigation.source_id === 'string';
}

/** Keep attachment selections in the existing controlled draft across text edits and remounts. */
export function useComposerSourceAttachments(
  references: readonly InlineReferenceSelection[],
  setReferences: (next: readonly InlineReferenceSelection[]) => void,
  workspaceId = '',
) {
  const lifecycle = useSourceDraftLifecycle(workspaceId);
  const current = useRef({ references, setReferences });
  useLayoutEffect(() => {
    current.current = { references, setReferences };
  }, [references, setReferences]);
  const add = useCallback(
    (reference: WorkspaceReference) => {
      const draft = current.current;
      const duplicate = draft.references.find(
        (row) =>
          workspaceReferenceIdentity(row.reference) === workspaceReferenceIdentity(reference),
      );
      if (duplicate) {
        if (
          duplicate.reference.navigation.source_draft_id !== reference.navigation.source_draft_id
        ) {
          void lifecycle
            .discard(reference)
            .catch((error: unknown) =>
              toast.error('Could not release duplicate attachment', { description: String(error) }),
            );
        }
        return;
      }
      draft.setReferences([...draft.references, { offset: 0, reference }]);
    },
    [lifecycle],
  );
  const setInlineReferences = useCallback((next: readonly InlineReferenceSelection[]) => {
    const draft = current.current;
    const attached = draft.references.filter((row) => isSourceAttachment(row.reference));
    const identities = new Set(attached.map((row) => workspaceReferenceIdentity(row.reference)));
    draft.setReferences([
      ...attached,
      ...next.filter((row) => !identities.has(workspaceReferenceIdentity(row.reference))),
    ]);
  }, []);
  const attached = references.filter((row) => isSourceAttachment(row.reference));
  return {
    add,
    keep: () => lifecycle.keep(references.map((row) => row.reference)),
    inlineReferences: references.filter((row) => !isSourceAttachment(row.reference)),
    setInlineReferences,
    tray: (onOpen?: (reference: WorkspaceReference) => void, onOpenFolder = onOpen) =>
      attached.length ? (
        <div
          role="group"
          aria-label="Attached sources"
          className="flex w-full flex-wrap gap-2 px-3 pt-3"
        >
          {attached.map(({ reference }) => (
            <SourceAttachmentCard
              key={workspaceReferenceIdentity(reference)}
              id={reference.id}
              label={reference.label}
              detail={reference.detail || 'Attached source'}
              folder={reference.navigation.source_kind === 'folder'}
              onOpen={
                reference.navigation.source_kind === 'folder'
                  ? onOpenFolder
                    ? () => onOpenFolder(reference)
                    : undefined
                  : onOpen
                    ? () => onOpen(reference)
                    : undefined
              }
              onRemove={async () => {
                try {
                  await lifecycle.discard(reference);
                  const draft = current.current;
                  draft.setReferences(
                    draft.references.filter(
                      (row) =>
                        workspaceReferenceIdentity(row.reference) !==
                        workspaceReferenceIdentity(reference),
                    ),
                  );
                } catch (error) {
                  toast.error('Could not remove attachment', {
                    description: error instanceof Error ? error.message : String(error),
                  });
                }
              }}
            />
          ))}
        </div>
      ) : null,
  };
}
