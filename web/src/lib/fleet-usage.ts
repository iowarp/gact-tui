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

/** One spend line: tokens, and cost when any turn reported one. */
export function spendLabel(spend: FleetSpend): string {
  const cost =
    spend.cost_usd >= 0.01
      ? ` · $${spend.cost_usd.toFixed(2)}`
      : spend.cost_usd > 0
        ? ' · under $0.01'
        : '';
  return `${formatTokens(spend.tokens)} tokens${cost}`;
}

/** The highest window use, for the readout's marker past 80%. */
export function busiestWindow(
  snapshot: AccountUsage | null | undefined,
): AccountUsageWindow | undefined {
  if (!snapshot?.windows.length) return undefined;
  return snapshot.windows.reduce((a, b) => (b.used_percent > a.used_percent ? b : a));
}
