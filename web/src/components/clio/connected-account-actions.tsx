import type { SourceProvider } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLinkIcon, LogOutIcon } from 'lucide-react';
import { openExternalUrlOrToast } from '@/tauri/external-url';
import { IconButton } from './primitives/icon-button';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from '@/hooks/use-repository';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

/** Account sign-out applies to every workspace on this CLIO, not just one folder. */
export function ConnectedAccountActions({ provider }: { provider: SourceProvider }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const [confirm, setConfirm] = useState(false);
  const signOut = useMutation({
    mutationFn: () => repository.signOutStorageAccount(provider.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['connected-storage', scope] });
      setConfirm(false);
    },
  });
  return (
    <>
      {provider.account_url && (
        <IconButton
          size="sm"
          label="Repository access"
          icon={<ExternalLinkIcon />}
          onClick={() => provider.account_url && openExternalUrlOrToast(provider.account_url)}
        />
      )}
      <IconButton
        size="sm"
        label={`Sign out of ${provider.name}`}
        icon={<LogOutIcon />}
        onClick={() => setConfirm(true)}
      />
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of {provider.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This signs you out across all workspaces on this {vocab.agent}. Downloaded files stay
              available. Linked folders will need you to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {signOut.error && (
            <p role="alert" className="text-sm text-destructive">
              {signOut.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signOut.isPending}>Cancel</AlertDialogCancel>
            <Button disabled={signOut.isPending} onClick={() => signOut.mutate()}>
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
