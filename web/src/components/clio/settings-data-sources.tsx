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
import { SourceProviderLogo } from './source-provider-logo';
import { t, ph } from '@lingui/core/macro';

const { agent } = vocab;

const INFO = t`Sign in to services that require an account, then connect their data to a workspace or create a new knowledge vault. Accounts are shared across workspaces on this service. Signing in does not attach data or grant an agent access to a dataset. Manage attached sources in the workspace Files view.`;

/** What each account brings, for a row that has no account name to show. */
const PURPOSE: Partial<Record<SourceProvider['id'], string>> = {
  github: t`Repository folders at a branch, tag or commit`,
  google_drive: t`Files and folders from Google Drive`,
  globus: t`Collections and transfers through Globus`,
  ndp: t`Datasets from National Data Platform catalogs`,
  obsidian: t`Knowledge graphs from linked notes`,
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
  if (row.id === 'obsidian') return { tone: 'idle', label: t`Local` };
  if (row.authenticated) return { tone: 'success', label: t`Signed in` };
  if (!row.configured) return { tone: 'warning', label: t`Setup needed` };
  return { tone: 'idle', label: t`Signed out` };
}

function accountMeta(row: SourceProvider): string {
  if (row.authenticated && row.account_name)
    return t`Signed in as ${ph({ account_name: row.account_name })}`;
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
              <IconButton
                icon={<MoreIcon />}
                label={t`More actions for ${ph({ name: account.name })}`}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem
                onSelect={() => connect(account, obsidian ? 'existing' : undefined)}
              >
                {obsidian ? t`Connect an existing vault…` : t`Connect to a workspace…`}
              </DropdownMenuItem>
              {account.authenticated && account.account_url ? (
                <DropdownMenuItem asChild>
                  <ExternalLink href={account.account_url}>{t`Manage access`}</ExternalLink>
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
                    {t`Sign out…`}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        }
        icon={<AccountLogo provider={account.id} />}
        key={account.id}
        meta={accountMeta(account) || undefined}
        wrapMeta
        selected={login?.id === account.id}
        slot={
          obsidian ? (
            <SlotButton onClick={() => connect(account, 'new')}>{t`New vault`}</SlotButton>
          ) : account.authenticated ? null : (
            <SlotButton
              disabled={!account.configured}
              label={t`Sign in to ${ph({ name: account.name })}`}
              onClick={() => setLogin(account)}
            >
              {t`Sign in`}
            </SlotButton>
          )
        }
        status={state ? <StatusIndicator label={state.label} tone={state.tone} /> : null}
        title={account.name}
      />
    );
  };

  const list = (
    <div className="min-w-0">
      <SettingsGroupLabel className="mt-2">{t`Accounts`}</SettingsGroupLabel>
      <ItemList label={t`Data source accounts`}>
        {providers.isPending ? (
          <StateView kind="loading" size="row" title={t`Loading accounts…`} />
        ) : providers.error ? (
          unsupported(providers.error) ? (
            <StateView
              kind="unavailable"
              size="row"
              title={t`This service doesn’t offer data sources.`}
            />
          ) : (
            <StateView
              action={{ label: t`Retry`, onClick: () => void providers.refetch() }}
              kind="error"
              size="row"
              title={t`Accounts couldn’t be loaded.`}
            />
          )
        ) : accounts.length ? (
          accounts.map(row)
        ) : (
          <StateView
            kind="empty"
            size="row"
            title={t`No account providers are available on this service.`}
          />
        )}
      </ItemList>
    </div>
  );

  return (
    <div className="min-w-0">
      <SettingsSectionHeading info={INFO} title={t`Data sources`} />
      <ListDetailLayout
        detail={
          login ? (
            <DetailPane
              icon={<AccountLogo provider={login.id} />}
              key={`${scope}:${login.id}`}
              onClose={() => setLogin(undefined)}
              title={t`Sign in to ${ph({ name: login.name })}`}
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
          label: signOut.isPending ? t`Signing out…` : t`Sign out`,
          disabled: signOut.isPending,
          onConfirm: () => {
            if (signingOut) signOut.mutate(signingOut);
          },
        }}
        description={t`This signs you out across all workspaces on this ${agent}.`}
        icon={<LogOutIcon className="size-3.5" />}
        onOpenChange={(open) => {
          if (!open && !signOut.isPending) setLeaving(undefined);
        }}
        open={Boolean(signingOut)}
        title={
          signingOut?.name
            ? t`Sign out of ${ph({ name: signingOut.name })}?`
            : t`Sign out of account?`
        }
      >
        <p className="text-muted-foreground">
          {t`Downloaded files stay available. Linked folders will need you to sign in again.`}
        </p>
        {signOut.error ? (
          <p className="mt-2 text-destructive" role="alert">
            {t`Couldn’t sign out. Try again.`}
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
