import { useState } from 'react';
import type { NDPEndpointConnection } from '@clio/core/v3';
import { MoreIcon } from '@/lib/icon-vocabulary';
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
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { t, ph } from '@lingui/core/macro';

/** Visibility is reversible; removing a saved connection requires an explicit decision. */
export function NDPEndpointActions({
  endpoint,
  pending,
  onEdit,
  onHidden,
  onRemove,
}: {
  endpoint: NDPEndpointConnection;
  pending: boolean;
  onEdit: () => void;
  onHidden: (hidden: boolean) => void;
  onRemove: () => Promise<unknown>;
}) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t`Endpoint actions`} disabled={pending}>
            <MoreIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>{t`Edit endpoint`}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onHidden(!endpoint.hidden)}>
            {endpoint.hidden ? t`Show endpoint` : t`Hide endpoint`}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              setError('');
              setRemoving(true);
            }}
          >
            {t`Remove endpoint…`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Remove ${ph({ name: endpoint.name })}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`Remove this workspace’s saved API connection. Captured files stay in Sources. The remote service and its running streams are not stopped.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t`Cancel`}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                try {
                  await onRemove();
                  setRemoving(false);
                } catch (failure) {
                  setError(
                    failure instanceof Error ? failure.message : t`Could not remove endpoint`,
                  );
                }
              }}
            >
              {t`Remove endpoint`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
