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
  rangeMode?: boolean;
  unit?: string;
  value?: number | [number, number];
  setValue?: (value: number | [number, number]) => void;
  weight?: number;
}

/** A slider for a physical parameter, with a number field for typing an exact value. */
export function ClioNumberSlider({
  accessibility,
  label = '',
  max,
  min,
  rangeMode = false,
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
  const pair: [number, number] = Array.isArray(value)
    ? [snapToStep(value[0], range), snapToStep(value[1], range)].sort((a, b) => a - b) as [number, number]
    : [min, max];
  const fieldId = useId();
  const upperFieldId = useId();

  const write = (next: number | null) => {
    if (next === null || !Number.isFinite(next)) return;
    const snapped = snapToStep(next, range);
    if (snapped !== current) setValue?.(snapped);
  };
  const writeBound = (index: 0 | 1, next: number | null) => {
    if (next === null || !Number.isFinite(next)) return;
    const updated = [...pair] as [number, number];
    updated[index] = snapToStep(next, range);
    updated.sort((a, b) => a - b);
    if (updated[0] !== pair[0] || updated[1] !== pair[1]) setValue?.(updated);
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
            onValueCommitted={rangeMode ? (next) => writeBound(0, next) : write}
            size="sm"
            step={stepInUse}
            value={rangeMode ? pair[0] : current}
          >
            <NumberFieldGroup>
              <NumberFieldInput
                aria-label={rangeMode ? `${label} minimum` : label}
                className="font-mono text-xs"
                onKeyDown={(event) => {
                  // The field commits when it loses focus; Enter commits as well.
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            </NumberFieldGroup>
          </NumberField>
          {rangeMode ? (
            <>
              <span aria-hidden="true" className="text-xs text-muted-foreground">–</span>
              <NumberField
                className="w-24 gap-0"
                format={{ minimumFractionDigits: decimals, maximumFractionDigits: decimals }}
                id={upperFieldId}
                max={max}
                min={min}
                onValueCommitted={(next) => writeBound(1, next)}
                size="sm"
                step={stepInUse}
                value={pair[1]}
              >
                <NumberFieldGroup>
                  <NumberFieldInput
                    aria-label={`${label} maximum`}
                    className="font-mono text-xs"
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  />
                </NumberFieldGroup>
              </NumberField>
            </>
          ) : null}
          {unit ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
        </div>
      </div>
      <Slider
        aria-label={label}
        max={max}
        min={min}
        onValueChange={(next) => {
          if (rangeMode && next.length === 2) {
            setValue?.([snapToStep(next[0]!, range), snapToStep(next[1]!, range)]);
          } else if (typeof next[0] === 'number') setValue?.(snapToStep(next[0], range));
        }}
        step={stepInUse}
        value={rangeMode ? pair : [current]}
      />
    </div>
  );
}
