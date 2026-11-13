import type { AccountUsage, AccountUsageWindow, FleetSpend } from '@clio/core/v3';
import { Progress } from '@/components/ui/progress';
import { observedAgo, resetsIn, spendDetails, type UsageMode } from '@/lib/fleet-usage';
import { cn } from '@/lib/utils';
import { t, ph } from '@lingui/core/macro';
import { formatNumber } from '@/lib/locale-format';

/** A balance amount: dollars as `$1.50`, other currencies as `1.5 EUR`. */
function balanceAmount(remaining: number, currency: string): string {
  return currency === 'USD'
    ? `$${remaining.toFixed(2)}`
    : `${formatNumber(remaining, 2)} ${currency}`;
}

function WindowBar({ window, mode }: { window: AccountUsageWindow; mode: UsageMode }) {
  const used = Math.min(100, Math.max(0, window.used_percent));
  const shown = mode === 'used' ? used : 100 - used;
  const label = `${window.name}: ${Math.round(shown)}% ${mode}`;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{window.name}</span>
        <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5 tabular-nums text-muted-foreground">
          <span className="whitespace-nowrap">
            {Math.round(shown)}% {mode}
          </span>
          {window.resets_at ? (
            <span className="whitespace-nowrap">{resetsIn(window.resets_at)}</span>
          ) : null}
        </div>
      </div>
      <Progress
        aria-label={label}
        className={cn('h-1.5', used >= 80 && '[&>[data-slot=progress-indicator]]:bg-warning')}
        value={shown}
      />
    </div>
  );
}

/** Keep token and cost measurements on separate, unbroken lines in every usage view. */
export function SpendSummary({ spend, className }: { spend: FleetSpend; className?: string }) {
  const { tokens, cost } = spendDetails(spend);
  return (
    <div className={cn('grid gap-0.5 text-xs tabular-nums text-muted-foreground', className)}>
      <span className="whitespace-nowrap">{tokens}</span>
      {cost ? <span className="whitespace-nowrap">{cost}</span> : null}
    </div>
  );
}

/**
 * An account's usage: a bar per window with its reset, the balance of a credit
 * account, or "No limits" for a local one. A value from a failed read stays,
 * dimmed, with its age and the reason.
 */
export function UsageSummary({
  snapshot,
  missingReason,
  mode,
}: {
  snapshot: AccountUsage | null;
  missingReason?: string;
  mode: UsageMode;
}) {
  if (!snapshot) {
    return (
      <p className="text-xs text-muted-foreground">
        {missingReason === 'not_supported'
          ? t`Account limits unavailable for this connection`
          : t`No account-limit reading available`}
      </p>
    );
  }
  if (snapshot.state === 'unmetered') {
    return <p className="text-xs text-muted-foreground">{t`No usage limits`}</p>;
  }
  const stale = Boolean(snapshot.read_failure);
  const ago = observedAgo(snapshot.observed_at);
  const readFailure = snapshot.read_failure ?? '';
  return (
    <div className={cn('grid gap-2', stale && 'opacity-60')}>
      {snapshot.windows.map((window) => (
        <WindowBar key={window.name} mode={mode} window={window} />
      ))}
      {snapshot.balance && snapshot.balance.remaining !== null ? (
        <p
          className="text-xs tabular-nums"
          title={`${snapshot.balance.remaining} ${snapshot.balance.currency}`}
        >
          {snapshot.balance.limit !== null
            ? t`${ph({ amount: balanceAmount(snapshot.balance.remaining, snapshot.balance.currency) })} left of ${ph({ limit: snapshot.balance.limit })}`
            : t`${ph({ amount: balanceAmount(snapshot.balance.remaining, snapshot.balance.currency) })} left`}
        </p>
      ) : null}
      {!snapshot.windows.length && !snapshot.balance ? (
        <p className="text-xs text-muted-foreground">{t`No windows reported`}</p>
      ) : null}
      {stale ? (
        <p className="text-xs text-muted-foreground">
          {ago
            ? t`Last read failed (${readFailure}); showing values ${ago}.`
            : t`Last read failed (${readFailure}); showing values from an earlier read.`}
        </p>
      ) : snapshot.observed_at ? (
        <p className="text-xs text-muted-foreground">{observedAgo(snapshot.observed_at)}</p>
      ) : null}
    </div>
  );
}
