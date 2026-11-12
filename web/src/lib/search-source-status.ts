import type { SearchSource, WebSearchSource } from '@clio/core/v3';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';
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

/** Whether the source runs on the person's key or on its free use. */
export function searchSourceMode(source: SearchSource): string {
  if (source.has_key) return 'Your key';
  if (source.key_required) return 'Key required';
  return 'Free, no key';
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
