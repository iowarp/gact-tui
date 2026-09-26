import { formatParameterCount } from './model-facts';
import { parseRangeToken, RANGE_MODIFIERS, type RangeKind } from './model-range-tokens';

/**
 * The filter panel's slider scales and how a slider position becomes a range
 * token in the search bar (and back). Sizes and prices span orders of
 * magnitude, so their stops are logarithmic; the first and last stops are open
 * ends ("<1B", ">500B"; "Free", the catalog's top price) and a slider at both
 * ends writes no token at all.
 */
export interface ScaleStop {
  value: number;
  label: string;
  /** Whether the slider draws this stop's label as a tick. */
  tick: boolean;
}

export const SIZE_STOPS: readonly ScaleStop[] = [
  { value: 0, label: '<1B', tick: true },
  { value: 6e9, label: '6B', tick: true },
  { value: 12e9, label: '12B', tick: true },
  { value: 32e9, label: '32B', tick: true },
  { value: 128e9, label: '128B', tick: true },
  { value: 500e9, label: '>500B', tick: true },
];

/** "$0.1", "$25", "$360K": a price stop's tick. */
function priceLabel(value: number): string {
  if (value >= 1000) return `$${Number((value / 1000).toFixed(1))}K`;
  return `$${Number(value.toFixed(2))}`;
}

const COST_VALUES = [0, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 75];

/** Price stops from free up to the catalog's top input price (the last stop). */
export function costStops(maxPrice: number): ScaleStop[] {
  const top = Math.max(maxPrice, 0.05);
  const stops = COST_VALUES.filter((value) => value < top).map((value) => ({
    value,
    label: value === 0 ? 'Free' : priceLabel(value),
    tick: [0, 0.1, 1, 10].includes(value),
  }));
  return [...stops, { value: top, label: priceLabel(top), tick: true }];
}

export interface ReleasedStop {
  token?: string;
  label: string;
  /** The tick under the slider. */
  short: string;
  days: number;
}

/** Newest first; the last stop ("All") writes no token. */
export const RELEASED_STOPS: readonly ReleasedStop[] = [
  { token: 'released:<30d', label: '30 days', short: '<30d', days: 30 },
  { token: 'released:<3mo', label: '3 months', short: '<3mo', days: 91 },
  { token: 'released:<6mo', label: '6 months', short: '<6mo', days: 182 },
  { token: 'released:<1y', label: '1 year', short: '<1y', days: 365 },
  { token: 'released:<2y', label: '2 years', short: '<2y', days: 730 },
  { label: 'All', short: 'All', days: Number.POSITIVE_INFINITY },
];

export const RECENT_TOKEN = 'released:<6mo';

function sizeText(value: number): string {
  return formatParameterCount(value);
}

function costText(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** The token a numeric slider at [low, high] (stop indexes) writes, or none at both ends. */
export function numericRangeToken(
  kind: 'size' | 'cost',
  stops: readonly ScaleStop[],
  [low, high]: readonly [number, number],
): string | undefined {
  const last = stops.length - 1;
  const text = kind === 'size' ? sizeText : costText;
  if (low <= 0 && high >= last) return undefined;
  if (low <= 0) return `${kind}:<${text(stops[high]!.value)}`;
  if (high >= last) return `${kind}:>${text(stops[low]!.value)}`;
  return `${kind}:${text(stops[low]!.value)}-${text(stops[high]!.value)}`;
}

function nearestIndex(stops: readonly ScaleStop[], value: number): number {
  let best = 0;
  for (let index = 1; index < stops.length; index += 1) {
    if (Math.abs(stops[index]!.value - value) < Math.abs(stops[best]!.value - value)) best = index;
  }
  return best;
}

/** The first active range token of `kind` (never one of its modifiers). */
export function rangeTokenOf(kind: RangeKind, tokens: readonly string[]): string | undefined {
  return tokens.find((token) => parseRangeToken(token)?.kind === kind);
}

/** Where a numeric slider sits for the active tokens: both ends with no token. */
export function numericSliderValue(
  kind: 'size' | 'cost',
  stops: readonly ScaleStop[],
  tokens: readonly string[],
): [number, number] {
  const last = stops.length - 1;
  const token = rangeTokenOf(kind, tokens);
  const range = token ? parseRangeToken(token) : undefined;
  if (!range || range.kind === 'released') return [0, last];
  const low = range.min === undefined ? 0 : nearestIndex(stops, range.min);
  const high = range.max === undefined ? last : nearestIndex(stops, range.max);
  return [Math.min(low, high), Math.max(low, high)];
}

/** Where the Released slider sits: the stop whose span is nearest the active token's. */
export function releasedSliderValue(tokens: readonly string[]): number {
  const token = rangeTokenOf('released', tokens);
  const range = token ? parseRangeToken(token) : undefined;
  if (!range || range.kind !== 'released') return RELEASED_STOPS.length - 1;
  const days = range.amount * (range.unit === 'd' ? 1 : range.unit === 'mo' ? 30.4 : 365);
  let best = 0;
  RELEASED_STOPS.forEach((stop, index) => {
    if (Math.abs(stop.days - days) < Math.abs(RELEASED_STOPS[best]!.days - days)) best = index;
  });
  return best;
}

/**
 * The tokens with `kind`'s range replaced by `next` (removed when undefined).
 * Widening a slider back to both ends also drops its modifiers (`size:any`,
 * `cost:variable`, ...): they only mean something while the slider is narrowed.
 */
export function replaceRangeToken(
  tokens: readonly string[],
  kind: RangeKind,
  next: string | undefined,
): string[] {
  const modifiers = RANGE_MODIFIERS[kind];
  const kept = tokens.filter(
    (token) =>
      parseRangeToken(token)?.kind !== kind && (next !== undefined || !modifiers.includes(token.toLowerCase())),
  );
  return next ? [...kept, next] : kept;
}
