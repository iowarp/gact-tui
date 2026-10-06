import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SourceProvider } from '@clio/core/v3';
import { ArrowLeftIcon, CheckIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { Button } from '@/components/ui/button';
import { SettingsSectionHeading } from './settings-section-heading';
import { ConnectedAccountActions } from './connected-account-actions';
import { ConnectedAccountSignIn } from './connected-source-auth';
import { SourceProviderLogo } from './source-provider-logo';

/** Global accounts never list, create or change workspace data sources. */
export function DataSourceSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const client = useQueryClient();
  const [selection, setSelection] = useState<{ scope: string; provider: SourceProvider }>();
  const login = selection?.scope === scope ? selection.provider : undefined;
  const setLogin = (provider?: SourceProvider) =>
    setSelection(provider ? { scope, provider } : undefined);
  const providers = useQuery({
    queryKey: ['connected-storage', scope, 'accounts'],
    queryFn: ({ signal }) => repository.storageProviders(signal),
    refetchInterval: 30_000,
    retry: false,
  });
  const accounts =
    providers.data?.providers.filter((row) => row.authentication === 'browser') ?? [];
  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        title="Data sources"
        description="Sign in to accounts used by this service. Choose specific folders and datasets from Attach in a workspace."
      />
      {login ? (
        <section
          key={`${scope}:${login.id}`}
          className="grid gap-4"
          aria-label={`${login.name} account`}
        >
          <Button className="w-fit" size="sm" variant="ghost" onClick={() => setLogin(undefined)}>
            <ArrowLeftIcon aria-hidden="true" /> All accounts
          </Button>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <SourceProviderLogo provider={login.id} /> Sign in to {login.name}
          </h2>
          <ConnectedAccountSignIn
            provider={login.id}
            appUrl={login.account_url}
            onComplete={() => {
              void client.invalidateQueries({ queryKey: ['connected-storage', scope] });
              setLogin(undefined);
            }}
          />
        </section>
      ) : (
        <section aria-label="Data source accounts" className="divide-y divide-border/60">
          {providers.isPending ? (
            <p role="status" className="py-4 text-sm text-muted-foreground">
              Loading accounts…
            </p>
          ) : null}
          {providers.error ? (
            <div role="alert" className="py-4 text-sm text-destructive">
              {providers.error.message}
              <Button
                className="ml-3"
                size="sm"
                variant="outline"
                onClick={() => void providers.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {accounts.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex min-w-48 items-center gap-3">
                <SourceProviderLogo provider={row.id} />
                <div>
                  <h2 className="text-sm font-medium">{row.name}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {row.authenticated ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckIcon aria-hidden="true" className="size-3.5" />
                        Signed in
                      </span>
                    ) : row.configured ? (
                      'Signed out'
                    ) : (
                      'Setup needed'
                    )}
                  </p>
                  {!row.configured && row.setup_requirement ? (
                    <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                      {row.setup_requirement}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.authenticated ? (
                  <ConnectedAccountActions provider={row} />
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Sign in to ${row.name}`}
                    disabled={!row.configured}
                    onClick={() => setLogin(row)}
                  >
                    Sign in
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!providers.isPending && !providers.error && !accounts.length ? (
            <p className="py-4 text-sm text-muted-foreground">
              No account providers are available on this service.
            </p>
          ) : null}
        </section>
      )}
      <p className="text-sm leading-5 text-muted-foreground">
        Accounts are shared across workspaces on this service. Signing in does not attach data or
        grant an agent access to a dataset. Manage attached sources in the workspace Files view.
      </p>
    </div>
  );
}
