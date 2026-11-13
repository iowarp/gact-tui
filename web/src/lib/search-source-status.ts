import type { SearchAllowance, SearchSource, WebSearchSource } from '@clio/core/v3';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';
import { vocab } from '@/lib/brand-vocabulary';
import { formatClockTime, formatLocale, formatNumber } from '@/lib/locale-format';
import { ph, plural, t } from '@lingui/core/macro';

/** A search source's state in words, with the tone its status mark carries. */
export interface SearchSourceState {
  label: string;
  tone: StatusTone;
}

const isWebSource = (source: SearchSource): source is WebSearchSource => 'approved' in source;

/** Until when a resting source is held back, as a clock time. Epoch seconds in, local time out. */
const until = (seconds: number) => formatClockTime(seconds * 1000);

/**
 * What a source is doing now, in words. `approved` is the approval that covers it: the
 * row's own for a web source, the shared literature approval for a scholarly one.
 * `nowSeconds` is passed in so a rendered list and its test agree on the clock.
 */
export function searchSourceState(
  source: SearchSource,
  approved: boolean,
  nowSeconds: number,
): SearchSourceState {
  if (!source.enabled)
    return { label: t({ message: 'Off', context: 'search source state' }), tone: 'inactive' };
  if (source.key_required && !source.has_key) return { label: t`Needs your key`, tone: 'warning' };
  if (source.limited_kind === 'key_rejected') return { label: t`Key rejected`, tone: 'error' };
  if (source.limited_until !== null && source.limited_until > nowSeconds) {
    const time = until(source.limited_until);
    if (source.limited_kind === 'allowance_used')
      return { label: t`Allowance used up until ${time}`, tone: 'warning' };
    if (source.limited_kind === 'failed')
      return { label: t`Paused after errors until ${time}`, tone: 'warning' };
    return { label: t`Limited until ${time}`, tone: 'warning' };
  }
  if (source.declined) return { label: t`Declined this session`, tone: 'stopped' };
  if (!approved) return { label: t`Not approved yet`, tone: 'idle' };
  return isWebSource(source)
    ? { label: t({ message: 'Approved', context: 'search source state' }), tone: 'success' }
    : { label: t({ message: 'Ready', context: 'search source state' }), tone: 'success' };
}

/** How the agent reaches the source, in words. */
export function searchSourceMode(source: SearchSource): string {
  if (source.key_required && !source.has_key) return t`Key required`;
  if (source.tier === 'paid') return t`Your key, paid plan`;
  if (source.has_key) return t`Your key`;
  if (source.tier === 'registered') return t`Free, with your contact email`;
  return t`Free, no key`;
}

/** Dollars with fixed decimals in the active language ($0.10, $0.012); requests as counts. */
const amount = (allowance: SearchAllowance, value: number) => {
  if (allowance.unit !== 'usd') return formatNumber(value, 0);
  const digits = value < 0.1 ? 3 : 2;
  const money = new Intl.NumberFormat(formatLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `$${money.format(value)}`;
};

/** This agent's use of the free allowance ("12 of 100 today"); empty when there is none. */
export function searchSourceAllowance(source: SearchSource): string {
  const allowance = source.allowance;
  if (!allowance) return '';
  const { agent } = vocab;
  const used = amount(allowance, allowance.spent);
  const limit = amount(allowance, allowance.limit);
  const sentence =
    allowance.per === 'day'
      ? t`Free allowance used by ${agent}: ${used} of ${limit} today`
      : t`Free allowance used by ${agent}: ${used} of ${limit} this hour`;
  if (allowance.provider_remaining === undefined) return sentence;
  const left = amount(allowance, allowance.provider_remaining);
  return t`${sentence}; ${ph({ source: source.name })} says ${left} left`;
}

/** Requests in the agent's queue for the source; empty when the queue is empty. */
export function searchSourceQueue(source: SearchSource): string {
  if (!source.waiting && !source.running) return '';
  const { agent } = vocab;
  const running = source.running;
  const waiting = source.waiting;
  if (running && waiting) return t`In ${agent}'s queue: ${running} running, ${waiting} waiting`;
  if (running) return t`In ${agent}'s queue: ${running} running`;
  return t`In ${agent}'s queue: ${waiting} waiting`;
}

/** Today's answers and failures on this computer; empty when there were none of either. */
export function searchSourceUsage(source: SearchSource): string {
  if (!source.answered_today && !source.failed_today) return '';
  const searches = plural(source.answered_today, { one: '# search', other: '# searches' });
  const failed = source.failed_today;
  return t`Today on this computer: ${searches}, ${failed} failed`;
}

/** Whether saving a key changed the order the web sources are tried in. */
export function orderChanged(previous: readonly string[], next: readonly string[]): boolean {
  return previous.join('\n') !== next.join('\n');
}

/** Move one id up or down one place; the same list when it is already at that end. */
export function moveSourceId(order: readonly string[], id: string, step: -1 | 1): string[] {
  const index = order.indexOf(id);
  const target = index + step;
  if (index < 0 || target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
