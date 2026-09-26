import type { ModelFactSummary } from './model-facts';

/**
 * The picker's RANGE tokens -- what the filter panel's sliders write into the
 * search bar, so the query stays visible and editable:
 *
 * - `size:>32B`, `size:<1B`, `size:6B-12B` -- total parameters (K/M/B/T),
 *   bounds inclusive. It means models KNOWN to be that size: a model whose size
 *   no source states is left out unless `size:any` is also active (the panel's
 *   "Include unknown size").
 * - `cost:<1`, `cost:>2`, `cost:0.1-1` -- USD per 1M input tokens, inclusive.
 *   Only metered prices are numbers, so a model priced any other way is left
 *   out unless its own modifier is active: `cost:variable` (a router: the price
 *   depends on the routed model), `cost:subscription` (billed through a plan,
 *   e.g. Claude Code / Codex) or `cost:unpriced` (no source states a price).
 * - `released:<6mo`, `released:<30d`, `released:<1y` -- released within that
 *   long of the service's own "as of" day (the day it judged `recent` by). An
 *   unstated release never passes a `released:` range.
 *
 * The modifiers filter nothing by themselves: they only widen their range,
 * and only mean something while it is active.
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

export const SIZE_ANY_TOKEN = 'size:any';
export const COST_VARIABLE_TOKEN = 'cost:variable';
export const COST_SUBSCRIPTION_TOKEN = 'cost:subscription';
export const COST_UNPRICED_TOKEN = 'cost:unpriced';

/** Each range kind's modifiers: the tokens that widen it. */
export const RANGE_MODIFIERS: Record<RangeKind, readonly string[]> = {
  size: [SIZE_ANY_TOKEN],
  cost: [COST_VARIABLE_TOKEN, COST_SUBSCRIPTION_TOKEN, COST_UNPRICED_TOKEN],
  released: [],
};

const MODIFIERS = new Set(Object.values(RANGE_MODIFIERS).flat());

/** Whether a token only widens a range (`size:any`, `cost:variable`, ...). */
export function isRangeModifier(token: string): boolean {
  return MODIFIERS.has(token.toLowerCase());
}

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

/** A range token's meaning, or `undefined` for any other word (modifiers included). */
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

/** The cost modifier that lets a model with no metered price through, if any. */
function costModifierFor(facts: ModelFactSummary): string {
  const kind = facts.inputPrice?.kind;
  if (kind === 'variable') return COST_VARIABLE_TOKEN;
  if (kind === 'subscription') return COST_SUBSCRIPTION_TOKEN;
  return COST_UNPRICED_TOKEN;
}

/**
 * Whether a model with these facts passes one range token, given the active
 * modifiers (`size:any`, `cost:variable`, ...).
 */
export function matchesRange(
  range: RangeToken,
  facts: ModelFactSummary,
  modifiers: ReadonlySet<string> = new Set(),
  today: Date = new Date(),
): boolean {
  if (range.kind !== 'released') {
    if (range.kind === 'size') {
      const total = facts.parameters?.total;
      return total === undefined ? modifiers.has(SIZE_ANY_TOKEN) : within(total, range);
    }
    const price = facts.inputPrice;
    return price?.kind === 'usd' ? within(price.per1m, range) : modifiers.has(costModifierFor(facts));
  }
  if (!facts.releasedOn) return false;
  return facts.releasedOn >= releasedCutoff(range, facts.asOf ?? today);
}

/**
 * Whether a model passes every active token: membership tokens by `carried`,
 * range tokens by its facts (widened by the active modifiers), and modifiers
 * always.
 */
export function matchesActiveTokens(
  carried: ReadonlySet<string>,
  facts: ModelFactSummary,
  active: readonly string[],
): boolean {
  const modifiers = new Set(active.filter(isRangeModifier).map((token) => token.toLowerCase()));
  return active.every((token) => {
    if (isRangeModifier(token)) return true;
    const range = parseRangeToken(token);
    return range ? matchesRange(range, facts, modifiers) : carried.has(token);
  });
}
