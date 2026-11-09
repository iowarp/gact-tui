import type { SavedMcpService } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { DialogFrame } from './primitives/dialog-frame';

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
  // Keep the name on screen while the frame animates closed.
  const [shown, setShown] = useState(service);
  if (service && service !== shown) setShown(service);
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
    <DialogFrame
      confirm={{
        label: remove.isPending ? 'Removing…' : 'Remove',
        onConfirm: () => {
          if (service) remove.mutate(service);
        },
        tone: 'destructive',
        disabled: remove.isPending || !service,
      }}
      description="New conversations no longer get its tools. A conversation using it now keeps it until its turn ends."
      icon={<DeleteIcon />}
      onOpenChange={(open) => (open ? undefined : onClose())}
      open={Boolean(service)}
      title={`Remove saved ${shown?.name ?? 'MCP server'}?`}
    />
  );
}
