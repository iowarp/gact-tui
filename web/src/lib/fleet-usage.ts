import type { AccountUsage, AccountUsageWindow, FleetAccount, FleetSpend } from '@clio/core/v3';

export type UsageMode = 'used' | 'remaining';

const BILLING_LABEL: Record<FleetAccount['billing'], string> = {
  subscription: 'Subscription',
  credit: 'Credit',
  metered: 'Pay per use',
  free: 'Local or free',
};

/** Accounts in the order the Usage view groups them. */
export const BILLING_ORDER: FleetAccount['billing'][] = [
  'subscription',
  'credit',
  'metered',
  'free',
];

export function billingLabel(billing: FleetAccount['billing']): string {
  return BILLING_LABEL[billing];
}

/** "resets in 2 h 14 min" (or "resets now"), from an ISO time. */
export function resetsIn(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const minutes = Math.round((at - now) / 60_000);
  if (minutes <= 0) return 'resets now';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return `resets in ${days} d ${hours} h`;
  if (hours) return `resets in ${hours} h ${rest} min`;
  return `resets in ${rest} min`;
}

/** "observed 12 min ago", for a value that may be old. */
export function observedAgo(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return 'observed just now';
  if (minutes < 60) return `observed ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `observed ${hours} h ago` : `observed ${Math.round(hours / 24)} d ago`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/** Separate measurements so each view can lay them out without splitting a price. */
export function spendDetails(spend: FleetSpend): { tokens: string; cost?: string } {
  const cost =
    spend.cost_usd >= 0.01
      ? `$${spend.cost_usd.toFixed(2)}`
      : spend.cost_usd > 0
        ? 'under $0.01'
        : undefined;
  return { tokens: `${formatTokens(spend.tokens)} tokens`, cost };
}

/** A compact text alternative for nonvisual consumers. */
export function spendLabel(spend: FleetSpend): string {
  const { tokens, cost } = spendDetails(spend);
  return cost ? `${tokens}, ${cost}` : tokens;
}

/** The highest window use, for the readout's marker past 80%. */
export function busiestWindow(
  snapshot: AccountUsage | null | undefined,
): AccountUsageWindow | undefined {
  if (!snapshot?.windows.length) return undefined;
  return snapshot.windows.reduce((a, b) => (b.used_percent > a.used_percent ? b : a));
}

/**
 * One account's usage as a status word for its row: the busiest window
 * ("62% used" or "38% left"), a credit balance, "No limits" or why there is
 * no reading. An account that is not ready shows its health instead.
 */
export function accountUsageWords(
  account: FleetAccount,
  mode: UsageMode,
): { label: string; tone: 'success' | 'warning' | 'error' | 'idle'; hint?: string } {
  if (account.health !== 'ready') {
    const label = account.health.charAt(0).toUpperCase() + account.health.slice(1);
    return { label, tone: 'error', hint: account.failure || undefined };
  }
  const snapshot = account.usage;
  if (!snapshot) {
    return {
      label: 'No reading',
      tone: 'idle',
      hint:
        account.usage_missing_reason === 'not_supported'
          ? 'Account limits unavailable for this connection'
          : 'No account-limit reading available',
    };
  }
  if (snapshot.state === 'unmetered') return { label: 'No limits', tone: 'idle' };
  const stale = snapshot.read_failure ? `Last read failed (${snapshot.read_failure})` : undefined;
  const window = busiestWindow(snapshot);
  if (window) {
    const used = Math.round(Math.min(100, Math.max(0, window.used_percent)));
    const label = mode === 'used' ? `${used}% used` : `${100 - used}% left`;
    const hint = [window.name, resetsIn(window.resets_at), stale].filter(Boolean).join(', ');
    return { label, tone: stale || used >= 80 ? 'warning' : 'success', hint };
  }
  const balance = snapshot.balance;
  if (balance && (balance.remaining !== null || balance.used !== null)) {
    const amount = (value: number) =>
      balance.currency === 'USD'
        ? `$${value.toFixed(2)}`
        : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${balance.currency}`;
    const used =
      balance.used ??
      (balance.limit !== null && balance.remaining !== null
        ? balance.limit - balance.remaining
        : null);
    const low = balance.limit !== null && used !== null && used >= balance.limit * 0.8;
    const tone = stale || low ? 'warning' : 'success';
    // One measure per mode: "used" under Used, "left" under Remaining.
    if (mode === 'used' && used !== null)
      return { label: `${amount(used)} used`, tone, hint: stale };
    if (balance.remaining !== null)
      return {
        label: `${amount(balance.remaining)} left`,
        tone,
        hint: stale ?? (mode === 'used' ? 'Only the remaining balance is reported' : undefined),
      };
    return { label: `${amount(used as number)} used`, tone, hint: stale };
  }
  return { label: 'No windows', tone: 'idle', hint: stale };
}
