import { useEffect } from 'react';
import type { ComposerDraft } from './use-composer-draft';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { KNOWLEDGE_ATTACH_EVENT, type KnowledgeAttachRequest } from '@/lib/knowledge-navigation';
import { t } from '@lingui/core/macro';

/** Add an explicitly selected immutable note to the active workspace's unsent draft. */
export function useKnowledgeAttachment(workspaceId: string, draft: ComposerDraft) {
  const { settings } = useConnectionSettings();
  useEffect(() => {
    const attach = (event: Event) => {
      const detail = (event as CustomEvent<KnowledgeAttachRequest>).detail;
      if (
        detail.workspaceId !== workspaceId ||
        detail.scope !== connectionScope(settings) ||
        detail.resource.workspace_id !== workspaceId
      )
        return;
      const resource = detail.resource;
      if (
        draft.references.some(
          ({ reference }) =>
            reference.id === resource.id && reference.revision === String(resource.revision),
        )
      )
        return;
      draft.onReferencesChange([
        ...draft.references,
        {
          offset: draft.readValue().length,
          reference: {
            kind: 'resource',
            id: resource.id,
            label: resource.name,
            detail: t`Obsidian knowledge note`,
            revision: String(resource.revision),
            media_type: resource.detected_mime,
            navigation: { resource },
          },
        },
      ]);
    };
    window.addEventListener(KNOWLEDGE_ATTACH_EVENT, attach);
    return () => window.removeEventListener(KNOWLEDGE_ATTACH_EVENT, attach);
  }, [workspaceId, settings, draft]);
}
