import type { SourceProvider } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
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
        <ExternalLink
          href={provider.account_url}
          className="w-full text-right text-xs underline sm:w-auto"
        >
          Repository access
        </ExternalLink>
      )}
      <Button
        size="sm"
        variant="outline"
        aria-label={`Sign out of ${provider.name}`}
        onClick={() => setConfirm(true)}
      >
        Sign out
      </Button>
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
