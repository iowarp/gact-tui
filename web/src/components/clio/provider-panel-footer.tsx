import { LoaderCircleIcon, LogOutIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './primitives/icon-button';
import { RefreshButton } from './refresh-button';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckConnectionIcon, MoreIcon, RefreshIcon } from '@/lib/icon-vocabulary';
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
  /**
   * `bar`: the picker footer's provider bar. `manage`: the row that ends a
   * provider's group in one column, under its header (no logo or name).
   */
  variant?: 'bar' | 'manage';
  /** An "Update to <version>" button, before the icon actions. */
  update?: ReactNode;
  /** The narrowest manage row: the icon actions fold into one More menu. */
  fold?: boolean;
  /** Settings as a More menu item, for `fold`. */
  settingsItem?: ReactNode;
  /**
   * A provider that is not usable yet: its one fix (the Log in split, Add key,
   * Install or Check again) in place of Refresh and Reload models.
   */
  setup?: ReactNode;
  /** The same fix as More menu items, for `fold`. */
  setupItems?: ReactNode;
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
  variant = 'bar',
  update,
  fold = false,
  settingsItem,
  setup,
  setupItems,
  className,
}: ProviderPanelFooterProps) {
  const busy = Boolean(actions?.stage) || Boolean(logOut?.busy);
  const age = group.freshness ? freshnessAge(group.freshness) : undefined;
  const manage = variant === 'manage';
  const status = providerGroupStatus(group);
  const ready = group.health === 'healthy';
  // A provider fixing itself offers its fix, not the check and reload of a usable one.
  const providerActions = setup === undefined ? actions : undefined;
  const iconClass = manage ? 'size-[22px] [&_svg]:size-[13px]' : undefined;
  return (
    <TooltipProvider disableHoverableContent>
      <div
        aria-label={`${group.name} provider`}
        role="group"
        className={cn(
          'flex min-w-0 shrink-0 flex-nowrap items-center overflow-hidden',
          // The dot lines up with the model names, past the check gutter.
          manage ? 'h-7 w-full gap-[7px] text-[11px] text-faint' : 'h-full gap-1.5 ps-2 pe-1',
          className,
        )}
        // Only a usable provider has the action row; a provider in setup shows its Settings link.
        data-slot={
          manage ? 'provider-manage-row' : actions ? 'provider-panel-footer' : 'provider-bar'
        }
      >
        {manage ? null : (
          <>
            <ProviderLogoMark
              className="size-4 rounded-[4px]"
              provider={providerLogoId(group.id)}
            />
            {/* The provider row above owns the name and the interactive heartbeat;
                the bar repeats them visually and is named by its group label. */}
            <span
              aria-hidden="true"
              className="min-w-0 max-w-[40%] shrink truncate text-[12px] text-foreground before:content-[attr(data-name)]"
              data-name={group.name}
            />
          </>
        )}
        <span
          aria-hidden="true"
          className={cn(
            'size-[7px] shrink-0 rounded-full bg-current',
            (actions?.stage ? providerHealthPresentation('checking') : status).color,
          )}
          data-slot="provider-bar-status"
        />
        {manage && !actions?.stage && !error && !(!busy && info) ? (
          // Ready reads as its age alone ("● 2m"); anything else says what is wrong.
          <span
            className={cn('min-w-0 flex-1 truncate', !ready && status.color)}
            data-slot="provider-manage-status"
            title={
              (!ready && group.detail) ||
              (group.freshness ? `Checked ${formatFreshness(group.freshness)}` : group.detail)
            }
          >
            {ready && age ? (
              <>
                <span className="sr-only">{status.label}, checked </span>
                {age}
              </>
            ) : (
              status.label
            )}
          </span>
        ) : null}
        {age && !manage && !actions?.stage ? (
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
        ) : manage ? null : (
          <span className="min-w-0 flex-1" />
        )}
        {update}
        {manage && fold ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                className={cn('shrink-0', iconClass)}
                icon={<MoreIcon />}
                label={`${group.name} actions`}
                size="sm"
                tooltipSide="top"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44" side="top">
              {setupItems}
              {providerActions ? (
                <>
                  <DropdownMenuItem
                    disabled={busy}
                    onSelect={() => void providerActions.handshake.mutateAsync()}
                  >
                    <CheckConnectionIcon aria-hidden="true" />
                    Refresh
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={busy}
                    onSelect={() => void providerActions.refreshModels.mutateAsync()}
                  >
                    <RefreshIcon aria-hidden="true" />
                    Reload models
                  </DropdownMenuItem>
                </>
              ) : null}
              {logOut ? (
                <DropdownMenuItem disabled={busy} onSelect={logOut.run}>
                  <LogOutIcon aria-hidden="true" />
                  {logOut.label}
                </DropdownMenuItem>
              ) : null}
              {settingsItem}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {manage && !fold && setup && !actions?.stage ? setup : null}
        {providerActions && !(manage && fold) ? (
          <>
            <RefreshButton
              className={cn('shrink-0 text-muted-foreground hover:text-foreground', iconClass)}
              iconOnly
              label="Refresh"
              idleIcon={CheckConnectionIcon}
              title="Refresh: check connection, sign-in and models"
              refreshing={providerActions.handshake.isPending}
              disabled={busy}
              onRefresh={() => providerActions.handshake.mutateAsync()}
              size="icon-xs"
              type="button"
              variant="ghost"
            />
            <RefreshButton
              className={cn('shrink-0 text-muted-foreground hover:text-foreground', iconClass)}
              iconOnly
              label="Reload models"
              title="Reload models, updating the provider client first if needed"
              refreshing={providerActions.refreshModels.isPending}
              disabled={busy}
              onRefresh={() => providerActions.refreshModels.mutateAsync()}
              size="icon-xs"
              type="button"
              variant="ghost"
            />
          </>
        ) : null}
        {logOut && !(manage && fold) ? (
          <IconButton
            className={cn('shrink-0', iconClass)}
            disabled={busy}
            icon={<LogOutIcon aria-hidden="true" />}
            label={logOut.label}
            onClick={logOut.run}
            size="sm"
            tooltipSide="top"
            type="button"
          />
        ) : null}
        {manage && fold ? null : settings}
      </div>
    </TooltipProvider>
  );
}
