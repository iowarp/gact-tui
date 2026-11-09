import { LoaderCircleIcon, LogOutIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './primitives/icon-button';
import { RefreshButton } from './refresh-button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CheckConnectionIcon } from '@/lib/icon-vocabulary';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import {
  formatFreshness,
  providerGroupStatus,
  providerHealthPresentation,
  type ProviderGroup,
} from './model-picker-model';
import { ProviderLogoMark } from './provider-logo-mark';
import type { ProviderActions } from './provider-setup-state';

export interface ProviderLogOut {
  /** "Log out" for a sign-in, "Remove key" for a pasted key. */
  label: string;
  run: () => void;
  busy: boolean;
}

interface ProviderPanelFooterProps {
  group: ProviderGroup;
  /** The provider-level actions (Refresh and Reload models act on the whole provider). */
  actions?: ProviderActions;
  settings?: ReactNode;
  /** Present only when the provider supports it. */
  logOut?: ProviderLogOut;
  /** The latest provider-level failure, as one sentence. */
  error?: string;
  info?: string;
  className?: string;
}

/** "now", "4m", "3h", "2d": how long ago the provider was last checked. */
function freshnessAge(iso: string, now: number = Date.now()): string | undefined {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return undefined;
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/**
 * The provider bar, the picker footer's leading segment: the provider in
 * view (logo, name, health, last check), then what it is doing or its latest
 * failure, then icon actions -- Refresh (check the provider again), Reload
 * models (rediscover its list), Log out / Remove key where supported, and
 * Settings. A provider that is not usable yet shows only Settings. Each icon
 * names itself on hover.
 */
export function ProviderPanelFooter({
  group,
  actions,
  settings,
  logOut,
  error,
  info,
  className,
}: ProviderPanelFooterProps) {
  const busy = Boolean(actions?.stage) || Boolean(logOut?.busy);
  const age = group.freshness ? freshnessAge(group.freshness) : undefined;
  return (
    <TooltipProvider disableHoverableContent>
      <div
        aria-label={`${group.name} provider`}
        role="group"
        className={cn(
          'flex h-full min-w-0 shrink-0 flex-nowrap items-center gap-1.5 overflow-hidden ps-2 pe-1',
          className,
        )}
        // Only a usable provider has the action row; a provider in setup shows its Settings link.
        data-slot={actions ? 'provider-panel-footer' : 'provider-bar'}
      >
        <ProviderLogoMark className="size-4 rounded-[4px]" provider={providerLogoId(group.id)} />
        {/* The provider row above owns the name and the interactive heartbeat;
            the bar repeats them visually and is named by its group label. */}
        <span
          aria-hidden="true"
          className="min-w-0 max-w-[40%] shrink truncate text-[12px] text-foreground before:content-[attr(data-name)]"
          data-name={group.name}
        />
        <span
          aria-hidden="true"
          className={cn(
            'size-[7px] shrink-0 rounded-full bg-current',
            (actions?.stage ? providerHealthPresentation('checking') : providerGroupStatus(group))
              .color,
          )}
          data-slot="provider-bar-status"
        />
        {age && !actions?.stage ? (
          <span
            className="shrink-0 font-mono text-[11px] text-muted-foreground"
            title={`Checked ${formatFreshness(group.freshness!)}`}
          >
            {age}
          </span>
        ) : null}
        {actions?.stage ? (
          <span
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-muted-foreground"
            data-slot="provider-panel-stage"
            role="status"
          >
            <LoaderCircleIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
            <span className="truncate">{actions.stage}</span>
          </span>
        ) : error ? (
          <span className="min-w-0 flex-1 truncate text-destructive" role="alert" title={error}>
            {error}
          </span>
        ) : !busy && info ? (
          <span
            className="min-w-0 flex-1 truncate text-muted-foreground"
            role="status"
            title={info}
          >
            {info}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {actions ? (
          <>
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
          </>
        ) : null}
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
