import type { SavedMcpService } from '@clio/core/v3';
import { useState } from 'react';
import { useRemoveSavedMcp } from '@/hooks/use-saved-mcp-services';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { DialogFrame } from './primitives/dialog-frame';
import { ph, t } from '@lingui/core/macro';

/**
 * Asks before removing a saved MCP service from its detail pane, where the row
 * and its inline confirm may be out of view.
 */
export function RemoveSavedMcpDialog({
  service,
  onClose,
}: {
  service?: SavedMcpService;
  onClose: () => void;
}) {
  // Keep the name on screen while the frame animates closed.
  const [shown, setShown] = useState(service);
  if (service && service !== shown) setShown(service);
  const remove = useRemoveSavedMcp(onClose);
  return (
    <DialogFrame
      confirm={{
        label: remove.isPending ? t`Removing…` : t`Remove`,
        onConfirm: () => {
          if (service) remove.mutate(service);
        },
        tone: 'destructive',
        disabled: remove.isPending || !service,
      }}
      description={t`New conversations no longer get its tools. A conversation using it now keeps it until its turn ends.`}
      icon={<DeleteIcon />}
      onOpenChange={(open) => (open ? undefined : onClose())}
      open={Boolean(service)}
      title={
        shown?.name ? t`Remove saved ${ph({ name: shown.name })}?` : t`Remove saved MCP server?`
      }
    />
  );
}
