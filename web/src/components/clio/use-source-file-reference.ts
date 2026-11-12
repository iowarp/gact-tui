import type { ConnectedSourceState, WorkspaceReference } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';

/** Preserve downloaded or linked file bytes through the existing resource pipeline. */
export function useSourceFileReference(
  workspaceId: string,
  onSelect?: (reference: WorkspaceReference) => void,
) {
  const repository = useRepository();
  return useMutation({
    mutationFn: async ({
      source,
      draftId,
      path,
      name = path,
      linked = false,
    }: {
      source: ConnectedSourceState;
      draftId?: string;
      path: string;
      /** The provider's name for `path`, shown on the chip. */
      name?: string;
      linked?: boolean;
    }) => {
      const lease = draftId || (await repository.beginSourceDraft(workspaceId, source.id)).id;
      const resource = await repository
        .attachSourceFile(workspaceId, source.id, path, linked, lease)
        .catch(async (error: unknown) => {
          if (!draftId) await repository.finishSourceDraft(workspaceId, source.id, lease, false);
          throw error;
        });
      onSelect?.({
        kind: 'resource',
        id: resource.id,
        // A portable alias names the stored copy; the chip keeps the provider's name.
        label: name === path ? resource.name : (name.split('/').at(-1) ?? resource.name),
        detail: `${source.label}: ${name}`,
        media_type: resource.detected_mime,
        revision: String(resource.revision),
        navigation: {
          resource_id: resource.id,
          source_id: source.id,
          source_draft_id: lease,
          source_provider: source.provider,
          source_path: path,
          ...(name !== path ? { source_name: name } : {}),
        },
      });
    },
  });
}
