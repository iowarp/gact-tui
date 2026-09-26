import { CalendarClockIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/reui/badge';
import {
  costStops,
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
  SIZE_ANY_TOKEN,
} from '@/lib/model-range-tokens';
import type { ModelFilterToken } from '@/lib/model-filter-tokens';
import { ModelPickerRangeSlider, type RangeSliderOption } from './model-picker-range-slider';

interface FacetSlidersProps {
  tokens: readonly ModelFilterToken[];
  onTokensChange: (tokens: ModelFilterToken[]) => void;
  /** The highest input price (USD per 1M tokens) the listed models state. */
  maxInputPrice: number;
}

/**
 * The filter panel's three sliders -- Size (parameters), Cost (input $/1M
 * tokens) and Released -- each writing ONE range token into the search bar
 * (`size:>32B`, `cost:<1`, `released:<6mo`) and reading its position back from
 * it, so typing a token moves the slider and dragging a slider edits the query.
 */
export function ModelPickerFacetSliders({ tokens, onTokensChange, maxInputPrice }: FacetSlidersProps) {
  const prices = useMemo(() => costStops(maxInputPrice), [maxInputPrice]);
  const size = numericSliderValue('size', SIZE_STOPS, tokens);
  const cost = numericSliderValue('cost', prices, tokens);
  const released = releasedSliderValue(tokens);
  const sizeToken = rangeTokenOf('size', tokens);
  const costToken = rangeTokenOf('cost', tokens);
  const releasedToken = rangeTokenOf('released', tokens);
  const recent = tokens.includes(RECENT_TOKEN);

  /** An option that adds its modifier token while checked, usable only while `range` is narrowed. */
  function option(
    label: string,
    control: RangeSliderOption['control'],
    modifier: string,
    range: string | undefined,
  ): RangeSliderOption {
    const checked = tokens.includes(modifier);
    return {
      label,
      control,
      checked,
      disabled: !range,
      onCheckedChange: (next) => {
        const without = tokens.filter((token) => token !== modifier);
        onTokensChange(next ? [...without, modifier] : without);
      },
    };
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3" data-slot="facet-sliders">
      <ModelPickerRangeSlider
        hint="Total parameters, as the model's sources state them"
        label="Size"
        onValueChange={([low, high]) =>
          onTokensChange(replaceRangeToken(tokens, 'size', numericRangeToken('size', SIZE_STOPS, [low!, high!])))
        }
        stops={SIZE_STOPS}
        options={[option('Include unknown size', 'switch', SIZE_ANY_TOKEN, sizeToken)]}
        token={sizeToken}
        value={size}
      />
      <ModelPickerRangeSlider
        hint="Input price in USD per 1M tokens"
        label="Cost"
        onValueChange={([low, high]) =>
          onTokensChange(replaceRangeToken(tokens, 'cost', numericRangeToken('cost', prices, [low!, high!])))
        }
        stops={prices}
        options={[
          option('Variable price (routers)', 'checkbox', COST_VARIABLE_TOKEN, costToken),
          option('Subscription (billed by a plan)', 'checkbox', COST_SUBSCRIPTION_TOKEN, costToken),
          option('Unpriced (no price stated)', 'checkbox', COST_UNPRICED_TOKEN, costToken),
        ]}
        token={costToken}
        value={cost}
      />
      <ModelPickerRangeSlider
        aside={
          <Badge asChild radius="default" size="lg" variant={recent ? 'primary-light' : 'outline'}>
            <button
              aria-pressed={recent}
              className="cursor-pointer gap-1 font-normal"
              data-slot="facet-recent"
              onClick={() => onTokensChange(replaceRangeToken(tokens, 'released', recent ? undefined : RECENT_TOKEN))}
              title={RECENT_TOKEN}
              type="button"
            >
              <CalendarClockIcon aria-hidden="true" className="size-3" />
              Recent
            </button>
          </Badge>
        }
        hint="How long ago the model was released"
        label="Released"
        onValueChange={([index]) =>
          onTokensChange(replaceRangeToken(tokens, 'released', RELEASED_STOPS[index!]?.token))
        }
        stops={RELEASED_STOPS.map((stop) => ({ label: stop.short, tick: true }))}
        token={releasedToken}
        value={[released]}
      />
    </div>
  );
}
