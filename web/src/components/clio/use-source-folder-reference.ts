import type { ConnectedSourceState, WorkspaceReference } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';

/** Reuse ordinary resource custody and the composer's message-part pipeline for folders. */
export function useSourceFolderReference(
  workspaceId: string,
  onSelect?: (reference: WorkspaceReference) => void,
) {
  const repository = useRepository();
  return useMutation({
    mutationFn: async ({
      source,
      draftId,
      linked = false,
      path = '',
    }: {
      source: ConnectedSourceState;
      draftId?: string;
      linked?: boolean;
      path?: string;
    }) => {
      const lease = draftId || (await repository.beginSourceDraft(workspaceId, source.id)).id;
      const resource = await repository
        .attachSourceFolder(workspaceId, source.id, linked, path, lease)
        .catch(async (error: unknown) => {
          if (!draftId) await repository.finishSourceDraft(workspaceId, source.id, lease, false);
          throw error;
        });
      onSelect?.({
        kind: 'resource',
        id: resource.id,
        label: path ? `${source.label} / ${path}` : source.label,
        detail: linked ? 'Linked folder' : 'Downloaded folder',
        media_type: resource.detected_mime,
        revision: String(resource.revision),
        navigation: {
          resource_id: resource.id,
          source_id: source.id,
          source_draft_id: lease,
          source_provider: source.provider,
          source_kind: 'folder',
          source_path: path,
          source_linked: String(linked),
        },
      });
    },
  });
}
