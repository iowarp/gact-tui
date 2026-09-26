import { ListRestartIcon, LoaderCircleIcon, LogOutIcon, RefreshCwIcon } from 'lucide-react';
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
  /** Present only when the provider (or its signed-in transport) supports it. */
  logOut?: ProviderLogOut;
  /** The latest provider-level failure, as one sentence. */
  error?: string;
}

/**
 * The single action row under a usable provider's models: Refresh (check the
 * provider again), Reload models (rediscover its model list), and Log out /
 * Remove key only where the provider supports it. A running action's stage
 * shows at the end of the row -- the row is what it affects.
 */
export function ProviderPanelFooter({ actions, logOut, error }: ProviderPanelFooterProps) {
  const busy = Boolean(actions.stage) || Boolean(logOut?.busy);
  return (
    <div
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-1 border-t px-2 py-1.5"
      data-slot="provider-panel-footer"
    >
      <Button
        disabled={busy}
        onClick={() => actions.handshake.mutate()}
        size="sm"
        type="button"
        variant="ghost"
      >
        <RefreshCwIcon data-icon="inline-start" />
        Refresh
      </Button>
      <Button
        disabled={busy}
        onClick={() => actions.refreshModels.mutate()}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ListRestartIcon data-icon="inline-start" />
        Reload models
      </Button>
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
    </div>
  );
}
