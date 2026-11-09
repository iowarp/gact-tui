const fractionFormats = new Map<number, Intl.NumberFormat>();
let significantFormat: Intl.NumberFormat | undefined;

function fractionFormat(digits: number): Intl.NumberFormat {
  let format = fractionFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat(undefined, { maximumFractionDigits: digits });
    fractionFormats.set(digits, format);
  }
  return format;
}

/** The display text of one data cell: short decimals, readable UTC timestamps. */
export function formatDataCell(value: unknown, key: string): string {
  if (value === undefined || value === null || value === '') return 'Unavailable';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (/(?:^|_)(?:id|year)(?:$|_)/iu.test(key) && Number.isInteger(value)) return String(value);
    // CSV readers can expose binary float noise (for example -0.360000014
    // for a depth reported as -0.36). Keep the exact value in the cell title,
    // but display the short decimal when it is numerically indistinguishable.
    for (let digits = 0; digits <= 4; digits += 1) {
      const rounded = Number(value.toFixed(digits));
      if (Math.abs(value - rounded) <= Math.max(1e-7, Math.abs(value) * 1e-7)) {
        return fractionFormat(digits).format(rounded);
      }
    }
    significantFormat ??= new Intl.NumberFormat(undefined, { maximumSignificantDigits: 9 });
    return significantFormat.format(value);
  }
  if (typeof value === 'string') {
    const timestamp = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:\d\d)$/u.exec(
      value,
    );
    if (timestamp) {
      const zone =
        timestamp[3] === 'Z' || timestamp[3] === '+00:00' || timestamp[3] === '-00:00'
          ? 'UTC'
          : `UTC${timestamp[3]}`;
      return `${timestamp[1]} ${timestamp[2]} ${zone}`;
    }
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The exact stored text of one data cell, for its title; empty cells have none. */
export function exactDataCell(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
