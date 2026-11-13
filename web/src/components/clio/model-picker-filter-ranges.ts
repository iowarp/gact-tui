import type { LucideIcon } from 'lucide-react';
import {
  costStops,
  CONTEXT_STOPS,
  numericRangeToken,
  numericSliderValue,
  rangeTokenOf,
  RECENT_TOKEN,
  RELEASED_STOPS,
  releasedSliderValue,
  replaceRangeToken,
  SIZE_STOPS,
} from '@/lib/model-range-scales';
import {
  COST_SUBSCRIPTION_TOKEN,
  COST_UNPRICED_TOKEN,
  COST_VARIABLE_TOKEN,
  CONTEXT_ANY_TOKEN,
  SIZE_ANY_TOKEN,
} from '@/lib/model-range-tokens';
import type { ModelFilterToken } from '@/lib/model-filter-tokens';
import { QUICK_FILTER_ICONS } from './model-quick-filter-icons';
import { t } from '@lingui/core/macro';

/** One slider row: the scale's two ends, the thumbs and the token it writes. */
export interface RangeSliderRow {
  id: 'context' | 'size' | 'cost' | 'released';
  label: string;
  /** What the scale measures, on hover. */
  hint: string;
  icon: LucideIcon;
  /** Each stop's spoken value; the first and last are drawn at the ends. */
  stops: readonly string[];
  /** Stop indexes: one for a single thumb, two for a range. */
  value: readonly number[];
  onValueChange: (value: number[]) => void;
  /** The token the slider writes now (`context:>32K`). */
  token?: string;
  /** The thumb ←→ moves: the minimum for sizes, the maximum for prices; Shift moves the other. */
  keyThumb: 0 | 1;
}

/** A checkbox row under a slider: what the narrowed range also lets in. */
export interface RangeOptionRow {
  label: string;
  /** The token it writes, on hover. */
  token: string;
  checked: boolean;
  /** Usable only while the slider is narrowed (Recent is always usable). */
  disabled: boolean;
  onToggle: () => void;
}

export interface RangeSection {
  id: RangeSliderRow['id'];
  slider: RangeSliderRow;
  options: RangeOptionRow[];
}

interface RangeSectionsInput {
  tokens: readonly ModelFilterToken[];
  onTokensChange: (tokens: ModelFilterToken[]) => void;
  /** The highest input price (USD per 1M tokens) the listed models state. */
  maxInputPrice: number;
  /** Whether a listed model states its parameter count (Size is hidden otherwise). */
  sizes: boolean;
}

/**
 * The Filters rows' ranges -- Context (input tokens), Size (parameters), Cost
 * (input $/1M tokens) and Released -- each writing ONE range token into the
 * search bar (`size:>32B`, `cost:<1`, `released:<6mo`) and reading its
 * position back from it, so typing a token moves the slider and sliding
 * edits the query. Size appears only when the catalog states sizes (or a
 * typed size token is on).
 */
export function rangeFilterSections({
  tokens,
  onTokensChange,
  maxInputPrice,
  sizes,
}: RangeSectionsInput): RangeSection[] {
  const prices = costStops(maxInputPrice);
  const contextToken = rangeTokenOf('context', tokens);
  const sizeToken = rangeTokenOf('size', tokens);
  const costToken = rangeTokenOf('cost', tokens);
  const releasedToken = rangeTokenOf('released', tokens);
  const recent = tokens.includes(RECENT_TOKEN);

  function option(label: string, modifier: string, range: string | undefined): RangeOptionRow {
    const checked = tokens.includes(modifier);
    return {
      label,
      token: modifier,
      checked,
      disabled: !range,
      onToggle: () => {
        const without = tokens.filter((token) => token !== modifier);
        onTokensChange(checked ? without : [...without, modifier]);
      },
    };
  }

  const sections: RangeSection[] = [
    {
      id: 'context',
      slider: {
        id: 'context',
        label: t`Context`,
        hint: t`Input context in tokens. Type context:>922K for an exact minimum.`,
        icon: QUICK_FILTER_ICONS.context,
        stops: CONTEXT_STOPS.map((stop) => stop.label),
        value: numericSliderValue('context', CONTEXT_STOPS, tokens),
        onValueChange: ([low, high]) =>
          onTokensChange(
            replaceRangeToken(
              tokens,
              'context',
              numericRangeToken('context', CONTEXT_STOPS, [low!, high!]),
            ),
          ),
        token: contextToken,
        keyThumb: 0,
      },
      options: [option(t`Include unknown context`, CONTEXT_ANY_TOKEN, contextToken)],
    },
  ];
  if (sizes || sizeToken) {
    sections.push({
      id: 'size',
      slider: {
        id: 'size',
        label: t`Size`,
        hint: t`Total parameters, as the model's sources state them`,
        icon: QUICK_FILTER_ICONS.size,
        stops: SIZE_STOPS.map((stop) => stop.label),
        value: numericSliderValue('size', SIZE_STOPS, tokens),
        onValueChange: ([low, high]) =>
          onTokensChange(
            replaceRangeToken(tokens, 'size', numericRangeToken('size', SIZE_STOPS, [low!, high!])),
          ),
        token: sizeToken,
        keyThumb: 0,
      },
      options: [option(t`Include unknown size`, SIZE_ANY_TOKEN, sizeToken)],
    });
  }
  sections.push(
    {
      id: 'cost',
      slider: {
        id: 'cost',
        label: t`Cost`,
        hint: t`Input price in USD per 1M tokens`,
        icon: QUICK_FILTER_ICONS.cost,
        stops: prices.map((stop) => stop.label),
        value: numericSliderValue('cost', prices, tokens),
        onValueChange: ([low, high]) =>
          onTokensChange(
            replaceRangeToken(tokens, 'cost', numericRangeToken('cost', prices, [low!, high!])),
          ),
        token: costToken,
        keyThumb: 1,
      },
      options: [
        option(t`Variable price (routers)`, COST_VARIABLE_TOKEN, costToken),
        option(t`Subscription (billed by a plan)`, COST_SUBSCRIPTION_TOKEN, costToken),
        option(t`Unpriced (no price stated)`, COST_UNPRICED_TOKEN, costToken),
      ],
    },
    {
      id: 'released',
      slider: {
        id: 'released',
        label: t`Released`,
        hint: t`How long ago the model was released`,
        icon: QUICK_FILTER_ICONS.recent,
        stops: RELEASED_STOPS.map((stop) => stop.short),
        value: [releasedSliderValue(tokens)],
        onValueChange: ([index]) =>
          onTokensChange(replaceRangeToken(tokens, 'released', RELEASED_STOPS[index!]?.token)),
        token: releasedToken,
        keyThumb: 0,
      },
      options: [
        {
          label: t`Recent`,
          token: RECENT_TOKEN,
          checked: recent,
          disabled: false,
          onToggle: () =>
            onTokensChange(
              replaceRangeToken(tokens, 'released', recent ? undefined : RECENT_TOKEN),
            ),
        },
      ],
    },
  );
  return sections;
}

/** The slider value after one ←→ press on `thumb`, kept inside the scale and apart. */
export function steppedRange(
  value: readonly number[],
  stops: number,
  thumb: number,
  delta: number,
): number[] {
  const next = [...value];
  const last = stops - 1;
  if (next.length === 1) {
    next[0] = Math.min(last, Math.max(0, next[0]! + delta));
    return next;
  }
  const index = thumb === 0 ? 0 : 1;
  const low = index === 0 ? 0 : next[0]! + 1;
  const high = index === 0 ? next[1]! - 1 : last;
  next[index] = Math.min(high, Math.max(low, next[index]! + delta));
  return next;
}
