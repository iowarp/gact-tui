import { useCallback, useContext, useState, type ReactNode } from 'react';
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
import { t, ph } from '@lingui/core/macro';

/** Keep private authorization mounted while an accepted surface changes hosts. */
export function A2uiSourceSignInHost({
  workspaceId,
  scope,
  children,
}: {
  workspaceId: string;
  /** A pending sign-in belongs to this conversation; a new scope drops it. */
  scope?: string;
  children: ReactNode;
}) {
  const [pending, setPending] = useState<{ scope?: string; intent?: DataSourceIntent }>({ scope });
  if (pending.scope !== scope) setPending({ scope });
  const intent = pending.scope === scope ? pending.intent : undefined;
  const setIntent = useCallback(
    (next: DataSourceIntent | undefined) => setPending((current) => ({ ...current, intent: next })),
    [],
  );
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
          <DialogTitle>
            {provider?.name
              ? t`Sign in to ${ph({ provider: provider.name })}`
              : t`Sign in to data source`}
          </DialogTitle>
          <DialogDescription>
            {t`Sign-in stays private. The agent receives status and approved source references.`}
          </DialogDescription>
        </DialogHeader>
        {!sameWorkspace ? <p role="alert">{t`Open the original workspace to sign in.`}</p> : null}
        {sameWorkspace && owner.isFetching ? (
          <p role="status">{t`Checking this connection…`}</p>
        ) : null}
        {sameWorkspace && !owner.isFetching && (!matches || owner.error) ? (
          <p role="alert">
            {t`This sign-in action could not be checked against the connected ${ph({ agent: vocab.agent })}.`}
          </p>
        ) : null}
        {matches && !owner.isFetching && (!provider || !provider.configured) ? (
          <p role="alert">{t`Sign-in for this provider is unavailable on this ${ph({ agent: vocab.agent })}.`}</p>
        ) : null}
        {matches && provider?.configured && !owner.error ? (
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
