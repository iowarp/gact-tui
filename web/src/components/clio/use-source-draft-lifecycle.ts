import type { WorkspaceReference } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';

/** Roll back unsent workspace additions using the server's ownership receipt. */
export function useSourceDraftLifecycle(workspaceId: string) {
  const repository = useRepository();
  const client = useQueryClient();
  const finish = async (sourceId: string, draftId?: string, keep = false) => {
    if (!draftId) return;
    await repository.finishSourceDraft(workspaceId, sourceId, draftId, keep);
    await client.invalidateQueries({
      refetchType: 'all',
      predicate: (query) =>
        query.queryKey.includes('connected-storage') ||
        query.queryKey.includes('workspace-files') ||
        query.queryKey.includes('workspace-resources'),
    });
  };
  return {
    discard: async (reference: WorkspaceReference) => {
      await finish(
        String(reference.navigation.source_id),
        typeof reference.navigation.source_draft_id === 'string'
          ? reference.navigation.source_draft_id
          : undefined,
      );
    },
    removeDownload: async (sourceId: string, draftId?: string) => finish(sourceId, draftId),
    keep: async (references: readonly WorkspaceReference[]) => {
      for (const reference of references) {
        try {
          await finish(
            String(reference.navigation.source_id),
            typeof reference.navigation.source_draft_id === 'string'
              ? reference.navigation.source_draft_id
              : undefined,
            true,
          );
        } catch (error) {
          // The message has already been accepted. Never turn this into a second send.
          toast.error('Could not confirm attachment storage', {
            description: error instanceof Error ? error.message : String(error),
          });
        }
      }
    },
  };
}
