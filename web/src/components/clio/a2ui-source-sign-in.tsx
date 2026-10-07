import { useContext, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import type { DataSourceIntent } from '@/lib/a2ui/data-source-action';
import { SourceSignInContext } from '@/lib/a2ui/source-sign-in-context';
import { PresentationNavigation } from './presentation-navigation';
import { ConnectedAccountSignIn } from './connected-source-auth';
import { vocab } from '@/lib/brand-vocabulary';

/** Keep private authorization mounted while an accepted surface changes hosts. */
export function A2uiSourceSignInHost({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const [intent, setIntent] = useState<DataSourceIntent>();
  return (
    <SourceSignInContext.Provider value={setIntent}>
      {children}
      {intent ? (
        <A2uiSourceSignIn
          intent={intent}
          workspaceId={workspaceId}
          onClose={() => setIntent(undefined)}
        />
      ) : null}
    </SourceSignInContext.Provider>
  );
}

/** A normal A2UI button opens the existing private, host-bound sign-in flow. */
export function A2uiSourceSignIn({
  intent,
  onClose,
  workspaceId,
}: {
  intent: DataSourceIntent | undefined;
  onClose: () => void;
  workspaceId?: string;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const navigation = useContext(PresentationNavigation);
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const sameWorkspace = Boolean(
    intent && (workspaceId ?? navigation?.workspaceId) === intent.workspaceId,
  );
  const owner = useQuery({
    queryKey: ['a2ui-source-login', scope, intent?.clioId, intent?.provider],
    queryFn: ({ signal }) => repository.storageProviders(signal),
    enabled: sameWorkspace,
    retry: false,
    staleTime: 0,
  });
  const provider = owner.data?.providers.find((row) => row.id === intent?.provider);
  const matches = Boolean(intent && owner.data?.clio_id === intent.clioId && sameWorkspace);
  return (
    <Dialog
      open={Boolean(intent)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sign in to {provider?.name ?? 'data source'}</DialogTitle>
          <DialogDescription>
            Sign-in stays private. The agent receives status and approved source references.
          </DialogDescription>
        </DialogHeader>
        {!sameWorkspace ? <p role="alert">Open the original workspace to sign in.</p> : null}
        {sameWorkspace && owner.isFetching ? <p role="status">Checking this connection…</p> : null}
        {sameWorkspace && !owner.isFetching && (!matches || owner.error) ? (
          <p role="alert">
            This sign-in action could not be checked against the connected {vocab.agent}.
          </p>
        ) : null}
        {matches && !owner.isFetching && (!provider || !provider.configured) ? (
          <p role="alert">Sign-in for this provider is unavailable on this {vocab.agent}.</p>
        ) : null}
        {matches && provider?.configured && !owner.isFetching ? (
          <ConnectedAccountSignIn
            key={`${scope}:${intent?.clioId}:${provider.id}`}
            provider={provider.id}
            appUrl={provider.account_url}
            onComplete={() => {
              void queryClient.invalidateQueries({ queryKey: ['connected-storage', scope] });
              onClose();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
