import { LoaderCircleIcon, LogOutIcon } from 'lucide-react';
import { RefreshButton } from './refresh-button';
import { Button } from '@/components/ui/button';
import type { ProviderActions } from './provider-setup-state';

export interface ProviderLogOut {
  /** "Log out" for a sign-in, "Remove key" for a pasted key. */
  label: string;
  run: () => void;
  busy: boolean;
}

interface ProviderPanelFooterProps {
  /** The provider-level actions (Refresh and Reload models act on the whole provider). */
  actions: ProviderActions;
  /** Present only when the provider supports it. */
  logOut?: ProviderLogOut;
  /** The latest provider-level failure, as one sentence. */
  error?: string;
  info?: string;
}

/**
 * The single action row under a usable provider's models: Refresh (check the
 * provider again), Reload models (rediscover its model list), and Log out /
 * Remove key only where the provider supports it. A running action's stage
 * shows at the end of the row -- the row is what it affects.
 */
export function ProviderPanelFooter({ actions, logOut, error, info }: ProviderPanelFooterProps) {
  const busy = Boolean(actions.stage) || Boolean(logOut?.busy);
  return (
    <div
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-1 border-t px-2 py-1.5"
      data-slot="provider-panel-footer"
    >
      <RefreshButton
        label="Refresh"
        refreshing={actions.handshake.isPending}
        disabled={busy}
        onRefresh={() => actions.handshake.mutateAsync()}
        size="sm"
        type="button"
        variant="ghost"
      >
        Refresh
      </RefreshButton>
      <RefreshButton
        label="Reload models"
        refreshing={actions.refreshModels.isPending}
        disabled={busy}
        onRefresh={() => actions.refreshModels.mutateAsync()}
        size="sm"
        type="button"
        variant="ghost"
      >
        Reload models
      </RefreshButton>
      {logOut ? (
        <Button disabled={busy} onClick={logOut.run} size="sm" type="button" variant="ghost">
          <LogOutIcon data-icon="inline-start" />
          {logOut.label}
        </Button>
      ) : null}
      <span className="min-w-0 flex-1" />
      {actions.stage ? (
        <span
          className="flex min-w-0 items-center gap-1.5 truncate pe-1 text-xs text-muted-foreground"
          data-slot="provider-panel-stage"
          role="status"
        >
          <LoaderCircleIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
          {actions.stage}
        </span>
      ) : error ? (
        <span className="min-w-0 truncate pe-1 text-xs text-destructive" role="alert" title={error}>
          {error}
        </span>
      ) : null}
      {!busy && !error && info ? (
        <p className="w-full text-xs text-muted-foreground" role="status">
          {info}
        </p>
      ) : null}
    </div>
  );
}
