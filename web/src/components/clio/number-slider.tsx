import { useId } from 'react';
import { NumberField, NumberFieldGroup, NumberFieldInput } from '@/components/reui/number-field';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { effectiveStep, snapToStep, stepDecimals, type SliderRange } from './number-slider-values';

export interface ClioNumberSliderProps extends SliderRange {
  accessibility?: A2UIAccessibility;
  label?: string;
  unit?: string;
  value?: number;
  setValue?: (value: number) => void;
  weight?: number;
}

/** A slider for a physical parameter, with a number field for typing an exact value. */
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
  const stepInUse = effectiveStep(range);
  const decimals = stepDecimals(stepInUse);
  const current = snapToStep(
    typeof value === 'number' && Number.isFinite(value) ? value : min,
    range,
  );
  const fieldId = useId();

  const write = (next: number | null) => {
    if (next === null || !Number.isFinite(next)) return;
    const snapped = snapToStep(next, range);
    if (snapped !== current) setValue?.(snapped);
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
        <Label htmlFor={fieldId}>{label}</Label>
        <div className="flex items-center gap-1.5">
          {/* The field follows the slider and the data model; a typed value is
              written when it is committed (Enter or leaving the field). */}
          <NumberField
            className="w-24 gap-0"
            format={{ minimumFractionDigits: decimals, maximumFractionDigits: decimals }}
            id={fieldId}
            max={max}
            min={min}
            onValueCommitted={write}
            size="sm"
            step={stepInUse}
            value={current}
          >
            <NumberFieldGroup>
              <NumberFieldInput
                aria-label={label}
                className="font-mono text-xs"
                onKeyDown={(event) => {
                  // The field commits when it loses focus; Enter commits as well.
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            </NumberFieldGroup>
          </NumberField>
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
        step={stepInUse}
        value={[current]}
      />
    </div>
  );
}
