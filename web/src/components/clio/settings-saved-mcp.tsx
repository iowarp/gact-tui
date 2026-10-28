import type { SavedMcpService } from '@clio/core/v3';
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

/** Asks before removing a saved MCP service; new conversations then no longer get it. */
export function RemoveSavedMcpDialog({
  service,
  onClose,
}: {
  service?: SavedMcpService;
  onClose: () => void;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const remove = useMutation({
    mutationFn: (target: SavedMcpService) => repository.removeMcpConfiguration(target.name),
    onSuccess: async (_value, target) => {
      onClose();
      await Promise.all(
        (['mcp-configurations', 'mcp-servers', 'tools'] as const).map((key) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.key(key, settings.endpoint) }),
        ),
      );
      toast.success(`Removed ${target.name}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <AlertDialog onOpenChange={(open) => (open ? undefined : onClose())} open={Boolean(service)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {service?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            New conversations no longer get its tools. A conversation using it now keeps it until
            its turn ends.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (service) remove.mutate(service);
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
