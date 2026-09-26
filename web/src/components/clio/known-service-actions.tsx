import { DeleteIcon, EditIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { useState, type FormEvent } from 'react';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { deployNameError, type KnownServiceName } from './deploy-name';

/** One known service's row actions: rename it, or forget it on this device. */
export function KnownServiceActions({
  canForget,
  known,
  name,
  onForget,
  onRename,
  service,
}: {
  /** The desktop's own service can be renamed but never forgotten. */
  canForget: boolean;
  known: readonly KnownServiceName[];
  name: string;
  onForget: () => void;
  onRename: (name: string) => void;
  service: KnownServiceName;
}) {
  const [renaming, setRenaming] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string>();

  const save = (event: FormEvent) => {
    event.preventDefault();
    // The dialog is portalled, but React still bubbles its submit to the
    // connect page's own form around this row; it must not connect.
    event.stopPropagation();
    const invalid = deployNameError(draft, known, (other) => other.endpoint === service.endpoint);
    setError(invalid);
    if (invalid) return;
    onRename(draft.trim());
    setRenaming(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Service actions for ${name}`}
            className="mr-1"
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem
            onSelect={() => {
              setDraft(name);
              setError(undefined);
              setRenaming(true);
            }}
          >
            <EditIcon aria-hidden="true" /> Rename
          </DropdownMenuItem>
          {canForget ? (
            <DropdownMenuItem onSelect={() => setForgetting(true)} variant="destructive">
              <DeleteIcon aria-hidden="true" /> Forget on this device
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setRenaming} open={renaming}>
        <DialogContent className="sm:max-w-sm">
          <form className="grid gap-4" onSubmit={save}>
            <DialogHeader>
              <DialogTitle>Rename {name}</DialogTitle>
              <DialogDescription className="sr-only">
                The name shown for this service on this device.
              </DialogDescription>
            </DialogHeader>
            <Field data-invalid={Boolean(error) || undefined}>
              <FieldLabel htmlFor="known-service-name">Name</FieldLabel>
              <Input
                aria-invalid={Boolean(error)}
                autoComplete="off"
                autoFocus
                id="known-service-name"
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError(undefined);
                }}
                value={draft}
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
            <DialogFooter>
              <Button onClick={() => setRenaming(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setForgetting} open={forgetting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed from this device’s list. The service itself keeps running.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onForget} variant="destructive">
              Forget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
