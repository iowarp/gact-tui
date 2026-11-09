import type { FleetAccount, FleetSpend } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import {
  busiestWindow,
  observedAgo,
  resetsIn,
  spendDetails,
  spendLabel,
  type UsageMode,
} from '@/lib/fleet-usage';
import { providerLogoId } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ItemRow } from './primitives/item-row';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';

/** One width per column across every usage list, so figures line up down the page. */
const USAGE_COLUMNS = { statusWidth: 140, actionsWidth: 96, slotWidth: 52 } as const;

/** A figure in the status column, right-aligned with its full text on hover. */
export function UsageFigure({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        'w-full min-w-0 truncate text-right text-xs text-muted-foreground tabular-nums',
        className,
      )}
      title={children}
    >
      {children}
    </span>
  );
}

function money(value: number, currency: string): string {
  return currency === 'USD'
    ? `$${value.toFixed(2)}`
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function accountStatus(
  account: FleetAccount,
  mode: UsageMode,
): { label: string; tone: StatusTone } {
  const usage = account.usage;
  if (!usage) {
    return {
      label: account.usage_missing_reason === 'not_supported' ? 'Limits unavailable' : 'No reading',
      tone: 'idle',
    };
  }
  if (usage.state === 'unmetered') return { label: 'No limits', tone: 'idle' };
  const stale = Boolean(usage.read_failure);
  const busiest = busiestWindow(usage);
  if (busiest) {
    const used = Math.min(100, Math.max(0, busiest.used_percent));
    const shown = Math.round(mode === 'used' ? used : 100 - used);
    return {
      label: `${shown}% ${mode}`,
      tone: stale || used >= 80 ? 'warning' : 'success',
    };
  }
  if (usage.balance && usage.balance.remaining !== null) {
    return {
      label: `${money(usage.balance.remaining, usage.balance.currency)} left`,
      tone: 'info',
    };
  }
  return { label: 'No windows', tone: 'idle' };
}

function accountMeta(account: FleetAccount): { text: string; title: string } {
  const parts: string[] = [];
  if (account.health !== 'ready') parts.push(account.failure || account.health);
  const usage = account.usage;
  if (usage?.read_failure) {
    const when = observedAgo(usage.observed_at) || 'from an earlier read';
    parts.push(`Last read failed (${usage.read_failure}); showing values ${when}`);
  } else if (usage?.observed_at) {
    parts.push(observedAgo(usage.observed_at));
  } else if (!usage) {
    parts.push(
      account.usage_missing_reason === 'not_supported'
        ? 'Account limits unavailable for this connection'
        : 'No account-limit reading available',
    );
  }
  const text = parts.filter(Boolean).join(', ');
  return { text, title: text };
}

/** Recorded spend: tokens in the status column, cost at the right. */
export function SpendRow({
  title,
  icon,
  meta,
  spend,
  size,
}: {
  title: string;
  icon?: ReactNode;
  meta?: string;
  spend: FleetSpend;
  size?: 'sm';
}) {
  const { tokens, cost } = spendDetails(spend);
  return (
    <ItemRow
      {...USAGE_COLUMNS}
      actions={cost ? <UsageFigure className="text-foreground">{cost}</UsageFigure> : null}
      actionsVisible
      aria-label={`${title}: ${spendLabel(spend)}`}
      icon={icon}
      meta={meta}
      size={size}
      slot={null}
      status={<UsageFigure>{tokens}</UsageFigure>}
      title={<span title={title}>{title}</span>}
    />
  );
}

/**
 * An account: its busiest window as a figure, whether the agent may delegate
 * work to it, then a small row per usage window, its balance and its spend.
 */
export function UsageAccount({ account, mode }: { account: FleetAccount; mode: UsageMode }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const toggle = useMutation({
    mutationFn: (allowed: boolean) => repository.setDelegationAllowed(account.id, allowed),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.key('fleet', settings.endpoint) }),
    onError: (error: Error) => toast.error(error.message),
  });
  const status = accountStatus(account, mode);
  const meta = accountMeta(account);
  const usage = account.usage?.state === 'metered' ? account.usage : undefined;
  const stale = Boolean(usage?.read_failure);
  const delegate = `${vocab.agent} may use this account for delegated work`;
  return (
    <div data-slot="usage-account">
      <ItemRow
        {...USAGE_COLUMNS}
        actions={null}
        icon={
          <ModelSelectorLogo className="size-4 shrink-0" provider={providerLogoId(account.id)} />
        }
        meta={meta.text ? <span title={meta.title}>{meta.text}</span> : undefined}
        slot={
          <Switch
            aria-label={delegate}
            checked={account.delegation_allowed}
            disabled={toggle.isPending}
            onCheckedChange={(checked) => toggle.mutate(checked)}
            size="sm"
            title={delegate}
          />
        }
        status={
          <StatusIndicator
            className="ml-auto min-w-0 text-xs text-muted-foreground tabular-nums"
            label={status.label}
            tone={status.tone}
          />
        }
        title={<span title={account.label}>{account.label}</span>}
      />
      {usage?.windows.map((window) => {
        const used = Math.min(100, Math.max(0, window.used_percent));
        const shown = mode === 'used' ? used : 100 - used;
        const figure = `${Math.round(shown)}% ${mode}`;
        return (
          <ItemRow
            {...USAGE_COLUMNS}
            actions={
              <Progress
                aria-label={`${window.name}: ${figure}`}
                className={cn(
                  'h-1.5 w-full',
                  used >= 80 && '[&>[data-slot=progress-indicator]]:bg-warning',
                )}
                value={shown}
              />
            }
            actionsVisible
            className={cn(stale && 'opacity-60')}
            key={window.name}
            meta={window.resets_at ? resetsIn(window.resets_at) : undefined}
            size="sm"
            slot={null}
            status={<UsageFigure className="text-foreground">{figure}</UsageFigure>}
            title={<span title={window.name}>{window.name}</span>}
          />
        );
      })}
      {usage?.balance && usage.balance.remaining !== null ? (
        <ItemRow
          {...USAGE_COLUMNS}
          actions={
            usage.balance.limit !== null ? (
              <UsageFigure>{`of ${money(usage.balance.limit, usage.balance.currency)}`}</UsageFigure>
            ) : null
          }
          actionsVisible
          className={cn(stale && 'opacity-60')}
          size="sm"
          slot={null}
          status={
            <UsageFigure className="text-foreground">
              {`${money(usage.balance.remaining, usage.balance.currency)} left`}
            </UsageFigure>
          }
          title="Balance"
        />
      ) : null}
      {account.spend ? (
        <SpendRow size="sm" spend={account.spend} title={`Recorded by ${vocab.agent}`} />
      ) : null}
    </div>
  );
}
