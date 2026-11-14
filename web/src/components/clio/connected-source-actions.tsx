import type { ConnectedSourceState } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { MoreIcon, EditIcon, DeleteIcon } from '@/lib/icon-vocabulary';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useRepository } from '@/hooks/use-repository';
import { IconButton } from './primitives/icon-button';
import { JumpLabel, menuAcceleratorKeyDown } from './primitives/menu-row';
import { t, ph } from '@lingui/core/macro';

/** Source management removes the connection, never the user's files or evidence. */
export function ConnectedSourceActions({
  workspaceId,
  source,
  onEdit,
  onRemoved,
  direct = false,
  compact = false,
}: {
  workspaceId: string;
  source: ConnectedSourceState;
  onEdit?: () => void;
  onRemoved: () => void;
  direct?: boolean;
  /** A 24px ⋯ with a hover name, for a list row's actions column. */
  compact?: boolean;
}) {
  const repository = useRepository();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () => repository.removeConnectedSource(workspaceId, source.id),
    onSuccess: () => {
      setConfirm(false);
      onRemoved();
    },
    onError: (error) => {
      if (!confirm) toast.error(t`Could not remove source`, { description: error.message });
    },
  });
  const requestRemove = () => {
    if (direct && source.can_edit_location && !source.local_path) remove.mutate();
    else setConfirm(true);
  };
  return (
    <>
      {direct ? (
        <>
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t`Edit source`}
              title={t`Edit source`}
              onClick={onEdit}
            >
              <EditIcon aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t`Discard source and close`}
            title={t`Discard source and close`}
            disabled={remove.isPending}
            onClick={requestRemove}
          >
            <DeleteIcon aria-hidden="true" />
          </Button>
        </>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {compact ? (
              <IconButton
                icon={<MoreIcon />}
                label={t`More actions for ${ph({ label: source.label })}`}
                size="sm"
                tooltipSide="bottom"
              />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t`Manage ${ph({ label: source.label })}`}
              >
                <MoreIcon aria-hidden="true" />
              </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onKeyDown={menuAcceleratorKeyDown}>
            <DropdownMenuItem data-accelerator="E" onSelect={onEdit}>
              <EditIcon aria-hidden="true" />
              <JumpLabel label={t`Edit source`} letter="E" />
            </DropdownMenuItem>
            <DropdownMenuItem data-accelerator="R" onSelect={requestRemove}>
              <DeleteIcon aria-hidden="true" />
              <JumpLabel label={t`Remove source`} letter="R" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Remove ${ph({ label: source.label })}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`Disconnect this source and remove it from your list. Original files, downloaded copies, and retained evidence stay in place.`}
              {['google_drive', 'globus'].includes(source.provider) ? (
                <> {t`Your account stays signed in for other sources.`}</>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {remove.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t`Cancel`}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? t`Removing…` : t`Remove source`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
