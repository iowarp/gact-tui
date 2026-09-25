/** Value rules for `clio.slider.v1`: clamp to the range, snap to the step grid from `min`. */

export interface SliderRange {
  min: number;
  max: number;
  step?: number;
}

/** The step in use: the producer's when positive and finite, else 1/100 of the range. */
export function effectiveStep({ min, max, step }: SliderRange): number {
  if (typeof step === 'number' && Number.isFinite(step) && step > 0) return step;
  const span = max - min;
  return span > 0 ? span / 100 : 1;
}

/** Decimal places the step implies, so 0.01 shows two and 5 shows none. */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const text = step.toString();
  if (text.includes('e-')) return Number(text.split('e-')[1]) || 0;
  return text.includes('.') ? text.split('.')[1]!.length : 0;
}

export function snapToStep(value: number, range: SliderRange): number {
  const { min, max } = range;
  const step = effectiveStep(range);
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = min + Math.round((clamped - min) / step) * step;
  const decimals = stepDecimals(step);
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals));
}

export function formatSliderValue(value: number, range: SliderRange): string {
  return value.toFixed(stepDecimals(effectiveStep(range)));
}

/**
 * Parse what the person typed. Accepts a comma as the decimal separator.
 * Returns the snapped value, or undefined when the text is not a number.
 */
export function parseTypedValue(text: string, range: SliderRange): number | undefined {
  const normalized = text.trim().replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/iu.test(normalized)) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? snapToStep(value, range) : undefined;
}
