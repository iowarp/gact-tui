import type { WorkspaceResource } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { t, ph } from '@lingui/core/macro';

/** Resource states a person is allowed to remove from the workspace. */
const REMOVABLE_STATES: readonly WorkspaceResource['state'][] = ['failed', 'quarantined', 'ready'];

/**
 * Confirms removing one workspace resource from custody, from the common file menu.
 *
 * Removal is destructive and irreversible, so it is confirmed, and a service
 * refusal is reported rather than swallowed: the resource is still there.
 */
export function WorkspaceResourceRemoveDialog({
  resource,
  workspaceId,
  open,
  onOpenChange,
}: {
  resource: WorkspaceResource;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const remove = useMutation({
    mutationFn: () => repository.deleteResource(workspaceId, resource.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceResources(settings.endpoint, workspaceId),
      });
      toast.success(t`Removed ${ph({ name: resource.name })}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Bytes are still arriving; cancelling an upload is the upload's own concern,
  // not a removal from custody.
  if (!REMOVABLE_STATES.includes(resource.state)) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Remove ${ph({ name: resource.name })} from this workspace?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {t`The original bytes and every derivative made from them are deleted from the connected agent. Messages that already used this resource keep their record of it.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Keep resource`}</AlertDialogCancel>
          <AlertDialogAction disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t`Remove resource`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
