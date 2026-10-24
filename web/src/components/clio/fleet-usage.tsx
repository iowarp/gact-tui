import type { AccountUsage, AccountUsageWindow } from '@clio/core/v3';
import { Progress } from '@/components/ui/progress';
import { observedAgo, resetsIn, type UsageMode } from '@/lib/fleet-usage';
import { cn } from '@/lib/utils';

function WindowBar({ window, mode }: { window: AccountUsageWindow; mode: UsageMode }) {
  const used = Math.min(100, Math.max(0, window.used_percent));
  const shown = mode === 'used' ? used : 100 - used;
  const label = `${window.name}: ${Math.round(shown)}% ${mode}`;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{window.name}</span>
        <span className="tabular-nums text-muted-foreground">
          {Math.round(shown)}% {mode}
          {window.resets_at ? ` · ${resetsIn(window.resets_at)}` : ''}
        </span>
      </div>
      <Progress
        aria-label={label}
        className={cn('h-1.5', used >= 80 && '[&>[data-slot=progress-indicator]]:bg-warning')}
        value={shown}
      />
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
        {missingReason === 'no_reading_yet'
          ? 'No reading yet: usage appears after the first call on this account.'
          : 'Usage is not reported.'}
      </p>
    );
  }
  if (snapshot.state === 'unmetered') {
    return <p className="text-xs text-muted-foreground">No usage limits</p>;
  }
  const stale = Boolean(snapshot.read_failure);
  return (
    <div className={cn('grid gap-2', stale && 'opacity-60')}>
      {snapshot.windows.map((window) => (
        <WindowBar key={window.name} mode={mode} window={window} />
      ))}
      {snapshot.balance && snapshot.balance.remaining !== null ? (
        <p className="text-xs tabular-nums">
          {snapshot.balance.currency === 'USD'
            ? `$${snapshot.balance.remaining.toFixed(2)}`
            : `${snapshot.balance.remaining} ${snapshot.balance.currency}`}{' '}
          left
          {snapshot.balance.limit !== null ? ` of ${snapshot.balance.limit}` : ''}
        </p>
      ) : null}
      {!snapshot.windows.length && !snapshot.balance ? (
        <p className="text-xs text-muted-foreground">No windows reported</p>
      ) : null}
      {stale ? (
        <p className="text-xs text-muted-foreground">
          Last read failed ({snapshot.read_failure}); showing values{' '}
          {observedAgo(snapshot.observed_at) || 'from an earlier read'}.
        </p>
      ) : snapshot.observed_at ? (
        <p className="text-xs text-muted-foreground">{observedAgo(snapshot.observed_at)}</p>
      ) : null}
    </div>
  );
}
