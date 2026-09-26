import type { ModelFactSummary } from './model-facts';

/**
 * The picker's RANGE tokens -- what the filter panel's sliders write into the
 * search bar, so the query stays visible and editable:
 *
 * - `size:>32B`, `size:<1B`, `size:6B-12B` -- total parameters (K/M/B/T),
 *   bounds inclusive. A model whose size no source stated still passes (the
 *   panel's "Include unknown size" toggle, on by default) unless `size:known`
 *   is also active.
 * - `cost:<1`, `cost:>2`, `cost:0.1-1` -- USD per 1M input tokens, inclusive.
 *   A price that is not a number (variable, subscription) or unstated still
 *   passes unless `cost:metered` is also active.
 * - `released:<6mo`, `released:<30d`, `released:<1y` -- released within that
 *   long of the service's own "as of" day (the day it judged `recent` by). An
 *   unstated release never passes a `released:` range.
 *
 * `size:known` and `cost:metered` are plain membership tokens: a model carries
 * them when its size / a per-token price is stated (see `factTokens`).
 */
export type RangeKind = 'size' | 'cost' | 'released';

export interface NumericRange {
  kind: 'size' | 'cost';
  min?: number;
  max?: number;
}

export interface ReleasedRange {
  kind: 'released';
  amount: number;
  unit: 'd' | 'mo' | 'y';
}

export type RangeToken = NumericRange | ReleasedRange;

export const SIZE_KNOWN_TOKEN = 'size:known';
export const COST_METERED_TOKEN = 'cost:metered';

const SIZE_UNITS: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

function sizeValue(text: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)([kmbt])$/iu.exec(text);
  if (!match) return undefined;
  return Number(match[1]) * SIZE_UNITS[match[2]!.toLowerCase()]!;
}

function costValue(text: string): number | undefined {
  if (!/^\d+(?:\.\d+)?$/u.test(text)) return undefined;
  return Number(text);
}

function numeric(kind: 'size' | 'cost', body: string): NumericRange | undefined {
  const value = kind === 'size' ? sizeValue : costValue;
  if (body.startsWith('<')) {
    const max = value(body.slice(1));
    return max === undefined ? undefined : { kind, max };
  }
  if (body.startsWith('>')) {
    const min = value(body.slice(1));
    return min === undefined ? undefined : { kind, min };
  }
  const [low, high, extra] = body.split('-');
  if (low === undefined || high === undefined || extra !== undefined) return undefined;
  const min = value(low);
  const max = value(high);
  return min === undefined || max === undefined || min > max ? undefined : { kind, min, max };
}

/** A range token's meaning, or `undefined` for any other word. */
export function parseRangeToken(token: string): RangeToken | undefined {
  const [key, body, extra] = token.toLowerCase().split(':');
  if (!body || extra !== undefined) return undefined;
  if (key === 'size' || key === 'cost') return numeric(key, body);
  if (key === 'released') {
    const match = /^<(\d+)(d|mo|y)$/u.exec(body);
    if (!match) return undefined;
    const amount = Number(match[1]);
    return amount > 0 ? { kind: 'released', amount, unit: match[2] as ReleasedRange['unit'] } : undefined;
  }
  return undefined;
}

export function isRangeToken(token: string): boolean {
  return parseRangeToken(token) !== undefined;
}

/** The earliest release day `range` still counts, from `asOf` back (calendar months/years). */
export function releasedCutoff(range: ReleasedRange, asOf: Date): Date {
  const cutoff = new Date(asOf.getTime());
  if (range.unit === 'd') cutoff.setUTCDate(cutoff.getUTCDate() - range.amount);
  else if (range.unit === 'mo') cutoff.setUTCMonth(cutoff.getUTCMonth() - range.amount);
  else cutoff.setUTCFullYear(cutoff.getUTCFullYear() - range.amount);
  return cutoff;
}

function within(value: number, range: NumericRange): boolean {
  return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
}

/** Whether a model with these facts passes one range token. */
export function matchesRange(range: RangeToken, facts: ModelFactSummary, today: Date = new Date()): boolean {
  if (range.kind !== 'released') {
    if (range.kind === 'size') {
      const total = facts.parameters?.total;
      return total === undefined ? true : within(total, range);
    }
    const price = facts.inputPrice;
    return price?.kind === 'usd' ? within(price.per1m, range) : true;
  }
  if (!facts.releasedOn) return false;
  return facts.releasedOn >= releasedCutoff(range, facts.asOf ?? today);
}

/** The membership tokens a model's facts give it (`size:known`, `cost:metered`). */
export function factTokens(facts: ModelFactSummary): string[] {
  const tokens: string[] = [];
  if (facts.parameters?.total !== undefined) tokens.push(SIZE_KNOWN_TOKEN);
  if (facts.inputPrice?.kind === 'usd') tokens.push(COST_METERED_TOKEN);
  return tokens;
}

/**
 * Whether a model passes every active token: membership tokens by `carried`,
 * range tokens by its facts.
 */
export function matchesActiveTokens(
  carried: ReadonlySet<string>,
  facts: ModelFactSummary,
  active: readonly string[],
): boolean {
  return active.every((token) => {
    const range = parseRangeToken(token);
    return range ? matchesRange(range, facts) : carried.has(token);
  });
}
