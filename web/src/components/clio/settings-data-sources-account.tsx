import type { SourceProvider } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon, LinkIcon, LogOutIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { DialogFrame } from './primitives/dialog-frame';
import { SettingsLoadError } from './settings-health-load-error';
import { IconButton, NamedTooltip } from './primitives/icon-button';
import { ItemRow } from './primitives/item-row';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { SourceProviderInfo } from './source-provider-info';
import { SourceProviderLogo } from './source-provider-logo';

/** Shared by every account row so status words and buttons line up. */
const ACCOUNT_COLUMNS = { statusWidth: 132, actionsWidth: 64, slotWidth: 84 } as const;

function accountStatus(row: SourceProvider): { tone: StatusTone; label: string } {
  if (row.id === 'obsidian') return { tone: 'success', label: 'No account needed' };
  if (row.authenticated) return { tone: 'success', label: 'Signed in' };
  if (row.configured) return { tone: 'idle', label: 'Signed out' };
  return { tone: 'warning', label: 'Needs setup' };
}

function accountMeta(row: SourceProvider) {
  if (row.id === 'obsidian') return 'Knowledge graphs from linked notes';
  if (row.authenticated) return row.account_name ? `Signed in as ${row.account_name}` : 'Account';
  if (!row.configured) return row.setup_requirement ?? 'This service needs setup first.';
  return 'Sign in to connect private data';
}

/** One account provider: sign-in state, Connect on hover, Sign in or New vault at the right. */
export function DataSourceAccountRow({
  row,
  selected,
  onConnect,
  onNewVault,
  onSignIn,
}: {
  row: SourceProvider;
  selected: boolean;
  onConnect: () => void;
  onNewVault: () => void;
  onSignIn: () => void;
}) {
  const status = accountStatus(row);
  const meta = accountMeta(row);
  const signedIn = row.id !== 'obsidian' && row.authenticated;
  return (
    <ItemRow
      {...ACCOUNT_COLUMNS}
      actions={
        <>
          {signedIn && row.account_url ? (
            <NamedTooltip label="Repository access">
              <Button
                asChild
                className="rounded-[5px] text-muted-foreground hover:bg-hover hover:text-foreground"
                size="icon-xs"
                variant="ghost"
              >
                <ExternalLink
                  aria-label={`Repository access for ${row.name}`}
                  href={row.account_url}
                >
                  <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
                </ExternalLink>
              </Button>
            </NamedTooltip>
          ) : null}
          <IconButton
            icon={<LinkIcon />}
            label={`Connect ${row.name}`}
            onClick={onConnect}
            size="sm"
          />
        </>
      }
      icon={<SourceProviderLogo provider={row.id} size="icon" />}
      meta={<span title={meta}>{meta}</span>}
      selected={selected}
      slot={
        row.id === 'obsidian' ? (
          <Button onClick={onNewVault} size="sm" variant="outline">
            New vault
          </Button>
        ) : signedIn ? (
          <AccountSignOut provider={row} />
        ) : (
          <Button
            aria-label={`Sign in to ${row.name}`}
            disabled={!row.configured}
            onClick={onSignIn}
            size="sm"
            variant="outline"
          >
            Sign in
          </Button>
        )
      }
      status={<StatusIndicator label={status.label} tone={status.tone} />}
      title={
        <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate">{row.name}</span>
          <SourceProviderInfo provider={row} />
        </span>
      }
    />
  );
}

/** Sign-out applies to every workspace on this service, so it asks first. */
function AccountSignOut({ provider }: { provider: SourceProvider }) {
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
      <Button
        aria-label={`Sign out of ${provider.name}`}
        onClick={() => setConfirm(true)}
        size="sm"
        variant="outline"
      >
        Sign out
      </Button>
      <DialogFrame
        confirm={{
          label: signOut.isPending ? 'Signing out…' : 'Sign out',
          onConfirm: () => signOut.mutate(),
          disabled: signOut.isPending,
        }}
        description="Downloaded files stay available."
        icon={<LogOutIcon />}
        onOpenChange={setConfirm}
        open={confirm}
        title={`Sign out of ${provider.name}?`}
      >
        <p className="text-muted-foreground">
          This signs you out across all workspaces on this {vocab.agent}. Linked folders will need
          you to sign in again.
        </p>
        {signOut.error ? (
          <SettingsLoadError className="mt-2" error={signOut.error} title="Not signed out." />
        ) : null}
      </DialogFrame>
    </>
  );
}
