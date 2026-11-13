import type { SearchAllowance, SearchSource, WebSearchSource } from '@clio/core/v3';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';
import { vocab } from '@/lib/brand-vocabulary';
import { formatClockTime } from '@/lib/locale-format';

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
  if (!source.enabled) return { label: 'Off', tone: 'inactive' };
  if (source.key_required && !source.has_key) return { label: 'Needs your key', tone: 'warning' };
  if (source.limited_kind === 'key_rejected') return { label: 'Key rejected', tone: 'error' };
  if (source.limited_until !== null && source.limited_until > nowSeconds) {
    const time = until(source.limited_until);
    if (source.limited_kind === 'allowance_used')
      return { label: `Allowance used up until ${time}`, tone: 'warning' };
    if (source.limited_kind === 'failed')
      return { label: `Paused after errors until ${time}`, tone: 'warning' };
    return { label: `Limited until ${time}`, tone: 'warning' };
  }
  if (source.declined) return { label: 'Declined this session', tone: 'stopped' };
  if (!approved) return { label: 'Not approved yet', tone: 'idle' };
  return isWebSource(source)
    ? { label: 'Approved', tone: 'success' }
    : { label: 'Ready', tone: 'success' };
}

/** How CLIO reaches the source, in words. */
export function searchSourceMode(source: SearchSource): string {
  if (source.key_required && !source.has_key) return 'Key required';
  if (source.tier === 'paid') return 'Your key, paid plan';
  if (source.has_key) return 'Your key';
  if (source.tier === 'registered') return 'Free, with your contact email';
  return 'Free, no key';
}

const amount = (allowance: SearchAllowance, value: number) =>
  allowance.unit === 'usd'
    ? `$${value.toFixed(value < 0.1 ? 3 : 2)}`
    : value.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** This CLIO's use of the free allowance ("12 of 100 today"); empty when there is none. */
export function searchSourceAllowance(source: SearchSource): string {
  const allowance = source.allowance;
  if (!allowance) return '';
  const period = allowance.per === 'day' ? 'today' : 'this hour';
  const used = `${amount(allowance, allowance.spent)} of ${amount(allowance, allowance.limit)}`;
  const left =
    allowance.provider_remaining === undefined
      ? ''
      : `; ${source.name} says ${amount(allowance, allowance.provider_remaining)} left`;
  return `Free allowance used by ${vocab.agent}: ${used} ${period}${left}`;
}

/** Requests in CLIO's queue for the source; empty when the queue is empty. */
export function searchSourceQueue(source: SearchSource): string {
  if (!source.waiting && !source.running) return '';
  const parts = [
    source.running ? `${source.running} running` : '',
    source.waiting ? `${source.waiting} waiting` : '',
  ].filter(Boolean);
  return `In ${vocab.agent}'s queue: ${parts.join(', ')}`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 'es'}`;

/** Today's answers and failures on this computer; empty when there were none of either. */
export function searchSourceUsage(source: SearchSource): string {
  if (!source.answered_today && !source.failed_today) return '';
  return `Today on this computer: ${plural(source.answered_today, 'search')}, ${source.failed_today} failed`;
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
