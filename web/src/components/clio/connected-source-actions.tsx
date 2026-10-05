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

/** Source management removes the connection, never the user's files or evidence. */
export function ConnectedSourceActions({
  workspaceId,
  source,
  onEdit,
  onRemoved,
  direct = false,
}: {
  workspaceId: string;
  source: ConnectedSourceState;
  onEdit?: () => void;
  onRemoved: () => void;
  direct?: boolean;
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
      if (!confirm) toast.error('Could not remove source', { description: error.message });
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
              aria-label="Edit source"
              title="Edit source"
              onClick={onEdit}
            >
              <EditIcon aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Discard source and close"
            title="Discard source and close"
            disabled={remove.isPending}
            onClick={requestRemove}
          >
            <DeleteIcon aria-hidden="true" />
          </Button>
        </>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Manage ${source.label}`}>
              <MoreIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <EditIcon aria-hidden="true" />
              Edit source
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={requestRemove}>
              <DeleteIcon aria-hidden="true" />
              Remove source
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {source.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Disconnect this source and remove it from your list. Original files, downloaded
              copies, and retained evidence stay in place.
              {['google_drive', 'globus'].includes(source.provider) &&
                ' Your account stays signed in for other sources.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {remove.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? 'Removing…' : 'Remove source'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
