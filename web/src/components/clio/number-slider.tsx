import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import {
  effectiveStep,
  formatSliderValue,
  parseTypedValue,
  snapToStep,
  type SliderRange,
} from './number-slider-values';

export interface ClioNumberSliderProps extends SliderRange {
  accessibility?: A2UIAccessibility;
  label?: string;
  unit?: string;
  value?: number;
  setValue?: (value: number) => void;
  weight?: number;
}

/** A slider for a physical parameter, with a number box for typing an exact value. */
export function ClioNumberSlider({
  accessibility,
  label = '',
  max,
  min,
  setValue,
  step,
  unit,
  value,
  weight,
}: ClioNumberSliderProps) {
  const range = { min, max, step };
  const current = snapToStep(
    typeof value === 'number' && Number.isFinite(value) ? value : min,
    range,
  );
  const shown = formatSliderValue(current, range);
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const inputId = useId();
  const hintId = useId();

  const commit = () => {
    const parsed = parseTypedValue(draft, range);
    if (parsed === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setEditing(false);
    setDraft(formatSliderValue(parsed, range));
    if (parsed !== current) setValue?.(parsed);
  };

  return (
    <div
      {...a2uiAccessibilityProps(accessibility)}
      className="min-w-0 space-y-2 py-1"
      data-slot="a2ui-number-slider"
      role="group"
      aria-label={a2uiAccessibilityLabel(accessibility) ?? label}
      style={typeof weight === 'number' ? { flex: `${weight}`, minHeight: 0 } : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium" htmlFor={inputId}>
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          <Input
            aria-describedby={invalid ? hintId : undefined}
            aria-invalid={invalid || undefined}
            className="h-7 w-24 text-right font-mono text-xs tabular-nums"
            id={inputId}
            inputMode="decimal"
            onBlur={commit}
            onFocus={() => setDraft(shown)}
            onChange={(event) => {
              setEditing(true);
              setInvalid(false);
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') {
                setEditing(false);
                setInvalid(false);
                setDraft(shown);
              }
            }}
            // The box follows the slider and data model except while it is being typed in.
            value={editing ? draft : shown}
          />
          {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
        </div>
      </div>
      <Slider
        aria-label={label}
        max={max}
        min={min}
        onValueChange={([next]) => {
          if (typeof next === 'number') setValue?.(snapToStep(next, range));
        }}
        step={effectiveStep(range)}
        value={[current]}
      />
      {invalid ? (
        <p className="text-xs text-destructive" id={hintId}>
          Enter a number from {formatSliderValue(min, range)} to {formatSliderValue(max, range)}.
        </p>
      ) : null}
    </div>
  );
}
