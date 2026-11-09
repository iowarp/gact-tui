import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TransportError, type SourceProvider } from '@clio/core/v3';
import { DatabaseIcon, GlobeIcon, LogOutIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExternalLink } from '@/components/ui/external-link';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ConnectedAccountSignIn } from './connected-source-auth';
import { SlotButton } from './extension-parts';
import type { ObsidianChoice } from './obsidian-source-form';
import { DetailPane, ListDetailLayout } from './primitives/detail-pane';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { SettingsSourceConnect } from './settings-source-connect';
import { SourceProviderInfo } from './source-provider-info';
import { SourceProviderLogo } from './source-provider-logo';

const INFO =
  'Sign in to services that require an account, then connect their data to a workspace or create a new knowledge vault. Accounts are shared across workspaces on this service. Signing in does not attach data or grant an agent access to a dataset. Manage attached sources in the workspace Files view.';

/** What each account brings, for a row that has no account name to show. */
const PURPOSE: Partial<Record<SourceProvider['id'], string>> = {
  github: 'Repository folders at a branch, tag or commit',
  google_drive: 'Files and folders from Google Drive',
  globus: 'Collections and transfers through Globus',
  ndp: 'Datasets from National Data Platform catalogs',
  obsidian: 'Knowledge graphs from linked notes',
};

/** A service that does not serve these routes at all, as opposed to one that failed. */
const unsupported = (error: unknown) =>
  error instanceof TransportError && [404, 405, 501].includes(error.status ?? 0);

/** The provider's mark at the row's 16px icon size; wordmarks fall back to a glyph. */
function AccountLogo({ provider }: { provider: SourceProvider['id'] }) {
  if (provider === 'globus') return <GlobeIcon />;
  if (provider === 'ndp') return <DatabaseIcon />;
  return (
    <span className="contents [&_img]:size-4 [&>span]:size-5 [&>span]:border-0 [&>span]:bg-transparent">
      <SourceProviderLogo provider={provider} />
    </span>
  );
}

function accountState(row: SourceProvider): { tone: StatusTone; label: string } | null {
  if (row.id === 'obsidian') return null;
  if (row.authenticated) return { tone: 'success', label: 'Signed in' };
  if (!row.configured) return { tone: 'warning', label: 'Setup needed' };
  return { tone: 'idle', label: 'Signed out' };
}

function accountMeta(row: SourceProvider): string {
  if (row.authenticated && row.account_name) return `Signed in as ${row.account_name}`;
  if (!row.configured && row.setup_requirement) return row.setup_requirement;
  return PURPOSE[row.id] ?? '';
}

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
  const [leaving, setLeaving] = useState<{ scope: string; provider: SourceProvider }>();
  const login = selection?.scope === scope ? selection.provider : undefined;
  const signingOut = leaving?.scope === scope ? leaving.provider : undefined;
  const setLogin = (provider?: SourceProvider) =>
    setSelection(provider ? { scope, provider } : undefined);
  const connect = (provider: SourceProvider, choice?: ObsidianChoice) =>
    setConnection({ scope, provider, choice });
  const providers = useQuery({
    queryKey: ['connected-storage', scope, 'accounts'],
    queryFn: ({ signal }) => repository.storageProviders(signal),
    refetchInterval: (query) => (unsupported(query.state.error) ? false : 30_000),
    retry: false,
  });
  const signOut = useMutation({
    mutationFn: (provider: SourceProvider) => repository.signOutStorageAccount(provider.id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['connected-storage', scope] });
      setLeaving(undefined);
    },
  });
  const accounts =
    providers.data?.providers.filter(
      (row) => row.authentication === 'browser' || row.id === 'obsidian',
    ) ?? [];

  const row = (account: SourceProvider) => {
    const state = accountState(account);
    const obsidian = account.id === 'obsidian';
    return (
      <ItemRow
        actions={
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<MoreIcon />} label={`More actions for ${account.name}`} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem
                onSelect={() => connect(account, obsidian ? 'existing' : undefined)}
              >
                {obsidian ? 'Connect an existing vault…' : 'Connect to a workspace…'}
              </DropdownMenuItem>
              {account.authenticated && account.account_url ? (
                <DropdownMenuItem asChild>
                  <ExternalLink href={account.account_url}>Manage access</ExternalLink>
                </DropdownMenuItem>
              ) : null}
              {account.authenticated ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      signOut.reset();
                      setLeaving({ scope, provider: account });
                    }}
                  >
                    Sign out…
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        }
        actionsWidth={30}
        icon={<AccountLogo provider={account.id} />}
        key={account.id}
        meta={accountMeta(account) || undefined}
        selected={login?.id === account.id}
        slot={
          obsidian ? (
            <SlotButton onClick={() => connect(account, 'new')}>New vault</SlotButton>
          ) : account.authenticated ? (
            <SlotButton label={`Connect ${account.name}`} onClick={() => connect(account)}>
              Connect
            </SlotButton>
          ) : (
            <SlotButton
              disabled={!account.configured}
              label={`Sign in to ${account.name}`}
              onClick={() => setLogin(account)}
            >
              Sign in
            </SlotButton>
          )
        }
        status={state ? <StatusIndicator label={state.label} tone={state.tone} /> : null}
        statusWidth={112}
        title={
          <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
            <span className="truncate">{account.name}</span>
            <SourceProviderInfo provider={account} />
          </span>
        }
      />
    );
  };

  const list = (
    <div className="min-w-0">
      <SettingsGroupLabel className="mt-0">Accounts</SettingsGroupLabel>
      <ItemList label="Data source accounts">
        {providers.isPending ? (
          <StateView kind="loading" size="row" title="Loading accounts…" />
        ) : providers.error ? (
          unsupported(providers.error) ? (
            <StateView
              kind="unavailable"
              size="row"
              title="This service doesn’t offer data sources."
            />
          ) : (
            <StateView
              action={{ label: 'Retry', onClick: () => void providers.refetch() }}
              kind="error"
              size="row"
              title="Accounts couldn’t be loaded."
            />
          )
        ) : accounts.length ? (
          accounts.map(row)
        ) : (
          <StateView
            kind="empty"
            size="row"
            title="No account providers are available on this service."
          />
        )}
      </ItemList>
    </div>
  );

  return (
    <div className="grid min-w-0 gap-4">
      <SettingsSectionHeading info={INFO} title="Data sources" />
      <ListDetailLayout
        detail={
          login ? (
            <DetailPane
              icon={<AccountLogo provider={login.id} />}
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
      <DialogFrame
        confirm={{
          label: signOut.isPending ? 'Signing out…' : 'Sign out',
          disabled: signOut.isPending,
          onConfirm: () => {
            if (signingOut) signOut.mutate(signingOut);
          },
        }}
        description={`This signs you out across all workspaces on this ${vocab.agent}.`}
        icon={<LogOutIcon className="size-3.5" />}
        onOpenChange={(open) => {
          if (!open && !signOut.isPending) setLeaving(undefined);
        }}
        open={Boolean(signingOut)}
        title={`Sign out of ${signingOut?.name ?? 'account'}?`}
      >
        <p className="text-muted-foreground">
          Downloaded files stay available. Linked folders will need you to sign in again.
        </p>
        {signOut.error ? (
          <p className="mt-2 text-destructive" role="alert">
            Couldn’t sign out. Try again.
          </p>
        ) : null}
      </DialogFrame>
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
