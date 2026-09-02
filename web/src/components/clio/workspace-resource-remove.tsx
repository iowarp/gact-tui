import type { WorkspaceResource } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/** Resource states a person is allowed to remove from the workspace. */
const REMOVABLE_STATES: readonly WorkspaceResource['state'][] = ['failed', 'quarantined', 'ready'];

/**
 * Removes one workspace resource from custody.
 *
 * A resource the service quarantined or failed to register is otherwise
 * permanent: the delete endpoint existed with nothing in the product able to
 * reach it, so a rejected upload sat in the workspace forever. Removal is
 * destructive and irreversible, so it is confirmed, and a service refusal is
 * reported rather than swallowed — the resource is still there.
 */
export function WorkspaceResourceRemoveAction({
  resource,
  workspaceId,
}: {
  resource: WorkspaceResource;
  workspaceId: string;
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
      toast.success(`Removed ${resource.name}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Bytes are still arriving; cancelling an upload is the upload's own concern,
  // not a removal from custody.
  if (!REMOVABLE_STATES.includes(resource.state)) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`Remove ${resource.name}`}
          className="size-8 shrink-0"
          disabled={remove.isPending}
          size="icon-sm"
          title="Remove from this workspace"
          variant="ghost"
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {resource.name} from this workspace?</AlertDialogTitle>
          <AlertDialogDescription>
            The original bytes and every derivative made from them are deleted from the connected
            agent. Messages that already used this resource keep their record of it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep resource</AlertDialogCancel>
          <AlertDialogAction onClick={() => remove.mutate()}>Remove resource</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
