import { ph, t } from '@lingui/core/macro';

/** The length unit the CAD view reads in; models are always held in millimetres. */
export type LengthUnit = 'mm' | 'in';

export const MM_PER_INCH = 25.4;

/** How many decimals a value gets: a size reads to the tenth, a measurement finer. */
export type LengthPrecision = 'size' | 'measure';

const DIGITS: Record<LengthUnit, Record<LengthPrecision, number>> = {
  mm: { size: 1, measure: 2 },
  in: { size: 2, measure: 3 },
};

/** `mm` in `unit`, as a number. */
export function lengthIn(mm: number, unit: LengthUnit): number {
  return unit === 'in' ? mm / MM_PER_INCH : mm;
}

/** `mm` in `unit` as digits only, never "-0.0". */
export function formatNumber(
  mm: number,
  unit: LengthUnit,
  precision: LengthPrecision = 'measure',
): string {
  const digits = DIGITS[unit][precision];
  const text = lengthIn(mm, unit).toFixed(digits);
  return /^-0\.?0*$/u.test(text) ? text.slice(1) : text;
}

/** A length with its unit: "12.35 mm", "0.486 in". */
export function formatLength(
  mm: number,
  unit: LengthUnit,
  precision: LengthPrecision = 'measure',
): string {
  const value = formatNumber(mm, unit, precision);
  return unit === 'in' ? t`${ph({ value })} in` : t`${ph({ value })} mm`;
}

/** A box's extent along x, y and z: "63.0 × 20.0 × 24.0 mm". */
export function formatBox(size: readonly [number, number, number], unit: LengthUnit): string {
  const [x, y, z] = size.map((value) => formatNumber(value, unit, 'size'));
  return unit === 'in'
    ? t`${ph({ x })} × ${ph({ y })} × ${ph({ z })} in`
    : t`${ph({ x })} × ${ph({ y })} × ${ph({ z })} mm`;
}

/** An angle in degrees, to a tenth. */
export function formatAngle(degrees: number): string {
  const value = degrees.toFixed(1);
  return t`${ph({ value })}°`;
}

const UNIT_KEY = 'clio.cad.unit';

/** The unit this browser last read models in (millimetres unless it chose inches). */
export function readLengthUnit(): LengthUnit {
  try {
    return window.localStorage.getItem(UNIT_KEY) === 'in' ? 'in' : 'mm';
  } catch {
    return 'mm';
  }
}

/** Remember the unit for the next model; a browser that refuses storage just forgets. */
export function saveLengthUnit(unit: LengthUnit): void {
  try {
    window.localStorage.setItem(UNIT_KEY, unit);
  } catch {
    // Private windows and blocked storage keep the unit for this view only.
  }
}
