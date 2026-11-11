import { describe, expect, it } from 'vitest';

import { formatClockTime, formatDateTime, formatNumber } from './locale-format';

describe('locale-format', () => {
  const instants = ['2026-03-04T05:06:07Z', '2025-12-31T23:59:59.999Z', 0, 'not a date'];

  it('matches Date#toLocaleTimeString with hour and minute', () => {
    for (const value of instants) {
      expect(formatClockTime(value)).toBe(
        new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      );
    }
  });

  it('matches Date#toLocaleString', () => {
    for (const value of instants) {
      expect(formatDateTime(value)).toBe(new Date(value).toLocaleString());
    }
  });

  it('matches Number#toLocaleString with maximum fraction digits', () => {
    for (const value of [0, 1.23456, 1234567.891, -0.5, 12]) {
      expect(formatNumber(value)).toBe(
        value.toLocaleString(undefined, { maximumFractionDigits: 3 }),
      );
      expect(formatNumber(value, 1)).toBe(
        value.toLocaleString(undefined, { maximumFractionDigits: 1 }),
      );
    }
  });
});
