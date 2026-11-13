import type { AccountUsage, AccountUsageWindow, FleetAccount, FleetSpend } from '@clio/core/v3';
import { t, ph } from '@lingui/core/macro';
import { formatNumber } from './locale-format';

export type UsageMode = 'used' | 'remaining';

const BILLING_LABEL: Record<FleetAccount['billing'], string> = {
  subscription: t`Subscription`,
  credit: t`Credit`,
  metered: t`Pay per use`,
  free: t`Local or free`,
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
  if (minutes <= 0) return t`resets now`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return t`resets in ${days} d ${hours} h`;
  if (hours) return t`resets in ${hours} h ${rest} min`;
  return t`resets in ${rest} min`;
}

/** "observed 12 min ago", for a value that may be old. */
export function observedAgo(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return t`observed just now`;
  if (minutes < 60) return t`observed ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  return hours < 48 ? t`observed ${hours} h ago` : t`observed ${days} d ago`;
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
        ? t`under $0.01`
        : undefined;
  return { tokens: t`${ph({ tokens: formatTokens(spend.tokens) })} tokens`, cost };
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
      label: t`No reading`,
      tone: 'idle',
      hint:
        account.usage_missing_reason === 'not_supported'
          ? t`Account limits unavailable for this connection`
          : t`No account-limit reading available`,
    };
  }
  if (snapshot.state === 'unmetered') return { label: t`No limits`, tone: 'idle' };
  const stale = snapshot.read_failure
    ? t`Last read failed (${ph({ read_failure: snapshot.read_failure })})`
    : undefined;
  const window = busiestWindow(snapshot);
  if (window) {
    const used = Math.round(Math.min(100, Math.max(0, window.used_percent)));
    const left = 100 - used;
    const label = mode === 'used' ? t`${used}% used` : t`${left}% left`;
    const hint = [window.name, resetsIn(window.resets_at), stale].filter(Boolean).join(', ');
    return { label, tone: stale || used >= 80 ? 'warning' : 'success', hint };
  }
  const balance = snapshot.balance;
  if (balance && (balance.remaining !== null || balance.used !== null)) {
    const amount = (value: number) =>
      balance.currency === 'USD'
        ? `$${value.toFixed(2)}`
        : `${formatNumber(value, 2)} ${balance.currency}`;
    const used =
      balance.used ??
      (balance.limit !== null && balance.remaining !== null
        ? balance.limit - balance.remaining
        : null);
    const low = balance.limit !== null && used !== null && used >= balance.limit * 0.8;
    const tone = stale || low ? 'warning' : 'success';
    // One measure per mode: "used" under Used, "left" under Remaining.
    if (mode === 'used' && used !== null)
      return { label: t`${ph({ amount: amount(used) })} used`, tone, hint: stale };
    if (balance.remaining !== null)
      return {
        label: t`${ph({ amount: amount(balance.remaining) })} left`,
        tone,
        hint: stale ?? (mode === 'used' ? t`Only the remaining balance is reported` : undefined),
      };
    return { label: t`${ph({ amount: amount(used as number) })} used`, tone, hint: stale };
  }
  return { label: t`No windows`, tone: 'idle', hint: stale };
}
