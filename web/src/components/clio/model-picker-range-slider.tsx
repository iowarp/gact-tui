import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface RangeSliderTick {
  label: string;
  /** Draw the label under the track (every stop is still a slider step). */
  tick: boolean;
}

interface RangeSliderProps {
  /** The section heading ("Size", "Cost"). */
  label: string;
  /** What the heading explains on hover ("Total parameters"). */
  hint: string;
  stops: readonly RangeSliderTick[];
  /** Stop indexes: one for a single thumb, two for a range. */
  value: readonly number[];
  onValueChange: (value: number[]) => void;
  /** The token this slider currently writes, shown beside the heading. */
  token?: string;
  /** A switch under the slider ("Include unknown size"). */
  toggle?: { label: string; checked: boolean; disabled: boolean; onCheckedChange: (checked: boolean) => void };
  /** Extra controls on the heading row (the Released slider's "Recent" chip). */
  aside?: ReactNode;
}

/**
 * One slider section of the model filter panel, Hugging Face style: a heading
 * with the token it writes, a track stepping through the scale's stops (log
 * spaced by the caller), tick labels under it, and an optional switch.
 */
export function ModelPickerRangeSlider({
  label,
  hint,
  stops,
  value,
  onValueChange,
  token,
  toggle,
  aside,
}: RangeSliderProps) {
  const id = useId();
  const last = stops.length - 1;
  return (
    <section className="flex flex-col gap-2" data-range={label.toLowerCase()} data-slot="facet-range">
      <div className="flex min-h-6 items-center gap-2">
        <h3 className="text-xs font-medium text-muted-foreground" title={hint}>
          {label}
        </h3>
        {token ? (
          <code className="rounded bg-primary/10 px-1 font-mono text-[0.7rem] text-primary" data-slot="facet-range-token">
            {token}
          </code>
        ) : null}
        <span className="ms-auto flex items-center gap-2">{aside}</span>
      </div>
      <div className="px-4">
        <Slider
          aria-label={label}
          max={last}
          min={0}
          minStepsBetweenThumbs={value.length > 1 ? 1 : 0}
          thumbProps={(index) => ({
            'aria-label': value.length > 1 ? `${label} ${index === 0 ? 'from' : 'to'}` : label,
            'aria-valuetext': stops[value[index] ?? 0]?.label,
          })}
          onValueChange={onValueChange}
          step={1}
          value={[...value]}
        />
        <div aria-hidden="true" className="relative mt-1.5 h-4 text-[0.68rem] text-muted-foreground tabular-nums">
          {stops.map((stop, index) =>
            stop.tick ? (
              <span
                className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                key={stop.label}
                style={{ left: `${(index / last) * 100}%` }}
              >
                {stop.label}
              </span>
            ) : null,
          )}
        </div>
      </div>
      {toggle ? (
        <div className="flex items-center gap-2">
          <Switch
            checked={toggle.checked}
            disabled={toggle.disabled}
            id={id}
            onCheckedChange={toggle.onCheckedChange}
            size="sm"
          />
          <Label className={cn('text-xs font-normal', toggle.disabled && 'text-muted-foreground')} htmlFor={id}>
            {toggle.label}
          </Label>
        </div>
      ) : null}
    </section>
  );
}
