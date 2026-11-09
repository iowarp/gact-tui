import { LoaderCircleIcon, LogOutIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './primitives/icon-button';
import { RefreshButton } from './refresh-button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CheckConnectionIcon } from '@/lib/icon-vocabulary';
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
  settings?: ReactNode;
  /** Present only when the provider supports it. */
  logOut?: ProviderLogOut;
  /** The latest provider-level failure, as one sentence. */
  error?: string;
  info?: string;
}

/**
 * The single action row under a usable provider's models: what the provider is
 * doing (or its latest failure) on the left, and icon actions on the right --
 * Refresh (check the provider again), Reload models (rediscover its list),
 * Settings, and Log out / Remove key only where the provider supports it. Each
 * icon names itself on hover.
 */
export function ProviderPanelFooter({
  actions,
  settings,
  logOut,
  error,
  info,
}: ProviderPanelFooterProps) {
  const busy = Boolean(actions.stage) || Boolean(logOut?.busy);
  return (
    <TooltipProvider disableHoverableContent>
      <div
        className="flex h-9 min-w-0 shrink-0 flex-nowrap items-center gap-0.5 overflow-hidden border-t px-1.5"
        data-slot="provider-panel-footer"
      >
        {actions.stage ? (
          <span
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs text-muted-foreground"
            data-slot="provider-panel-stage"
            role="status"
          >
            <LoaderCircleIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
            <span className="truncate">{actions.stage}</span>
          </span>
        ) : error ? (
          <span
            className="min-w-0 flex-1 truncate text-xs text-destructive"
            role="alert"
            title={error}
          >
            {error}
          </span>
        ) : !busy && info ? (
          <span
            className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
            role="status"
            title={info}
          >
            {info}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        <RefreshButton
          className="shrink-0 text-muted-foreground hover:text-foreground"
          iconOnly
          label="Refresh"
          idleIcon={CheckConnectionIcon}
          title="Refresh: check connection, sign-in and models"
          refreshing={actions.handshake.isPending}
          disabled={busy}
          onRefresh={() => actions.handshake.mutateAsync()}
          size="icon-xs"
          type="button"
          variant="ghost"
        />
        <RefreshButton
          className="shrink-0 text-muted-foreground hover:text-foreground"
          iconOnly
          label="Reload models"
          title="Reload models, updating the provider client first if needed"
          refreshing={actions.refreshModels.isPending}
          disabled={busy}
          onRefresh={() => actions.refreshModels.mutateAsync()}
          size="icon-xs"
          type="button"
          variant="ghost"
        />
        {logOut ? (
          <IconButton
            className="shrink-0"
            disabled={busy}
            icon={<LogOutIcon aria-hidden="true" />}
            label={logOut.label}
            onClick={logOut.run}
            size="sm"
            tooltipSide="top"
            type="button"
          />
        ) : null}
        {settings}
      </div>
    </TooltipProvider>
  );
}
