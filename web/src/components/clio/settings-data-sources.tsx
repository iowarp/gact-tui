import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SourceProvider } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import { DetailPane, ListDetailLayout } from './primitives/detail-pane';
import { ItemList } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { SettingsLoadError } from './settings-health-load-error';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { ConnectedAccountSignIn } from './connected-source-auth';
import { SourceProviderLogo } from './source-provider-logo';
import { SettingsSourceConnect } from './settings-source-connect';
import { DataSourceAccountRow } from './settings-data-sources-account';
import type { ObsidianChoice } from './obsidian-source-form';

/** Shared accounts and explicit workspace-scoped source entry points. */
export function DataSourceSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const client = useQueryClient();
  const [connection, setConnection] = useState<{
    scope: string;
    provider: SourceProvider;
    choice?: ObsidianChoice;
  }>();
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
    providers.data?.providers.filter(
      (row) => row.authentication === 'browser' || row.id === 'obsidian',
    ) ?? [];
  const list = (
    <>
      <SettingsGroupLabel>Accounts</SettingsGroupLabel>
      {providers.isPending ? (
        <StateView kind="loading" size="row" title="Loading accounts…" />
      ) : null}
      {providers.error ? (
        <SettingsLoadError
          error={providers.error}
          onRetry={() => void providers.refetch()}
          retrying={providers.isFetching}
          title="Accounts unavailable."
        />
      ) : null}
      {accounts.length ? (
        <ItemList label="Data source accounts">
          {accounts.map((row) => (
            <DataSourceAccountRow
              key={row.id}
              onConnect={() =>
                setConnection({
                  scope,
                  provider: row,
                  choice: row.id === 'obsidian' ? 'existing' : undefined,
                })
              }
              onNewVault={() => setConnection({ scope, provider: row, choice: 'new' })}
              onSignIn={() => setLogin(row)}
              row={row}
              selected={login?.id === row.id}
            />
          ))}
        </ItemList>
      ) : null}
      {!providers.isPending && !providers.error && !accounts.length ? (
        <StateView kind="empty" size="row" title="No account providers on this service" />
      ) : null}
    </>
  );
  return (
    <div className="grid gap-1">
      <SettingsSectionHeading
        info={`Connect data to a workspace or create a new knowledge vault. Sign in to services that require an account. Accounts are shared across workspaces on this ${vocab.agent}; signing in does not attach data or grant an agent access to a dataset. Manage attached sources in the workspace Files view.`}
        title="Data sources"
      />
      <ListDetailLayout
        detail={
          login ? (
            <DetailPane
              icon={<SourceProviderLogo provider={login.id} />}
              key={`${scope}:${login.id}`}
              onClose={() => setLogin(undefined)}
              title={`Sign in to ${login.name}`}
            >
              <ConnectedAccountSignIn
                appUrl={login.account_url}
                onComplete={() => {
                  void client.invalidateQueries({ queryKey: ['connected-storage', scope] });
                  setLogin(undefined);
                }}
                provider={login.id}
              />
            </DetailPane>
          ) : undefined
        }
        list={list}
      />
      {connection?.scope === scope ? (
        <SettingsSourceConnect
          choice={connection.choice}
          key={`${scope}:${connection.provider.id}:${connection.choice}`}
          onClose={() => setConnection(undefined)}
          provider={connection.provider}
        />
      ) : null}
    </div>
  );
}
