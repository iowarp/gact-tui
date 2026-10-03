import { describe, expect, it } from 'vitest';
import { dataQuerySchema, querySortSchema } from './data-query-schema';

describe('data query sort catalog compatibility', () => {
  it('defaults omitted desc to ascending, matching QuerySort and TableSort', () => {
    expect(dataQuerySchema.parse({ sort: [{ column: 'time' }] })).toEqual({
      sort: [{ column: 'time', desc: false }],
    });
  });

  it('preserves explicit directions in compound sorts', () => {
    expect(dataQuerySchema.parse({ sort: [
      { column: 'storm', desc: false }, { column: 'wind_kt', desc: true },
    ] }).sort).toEqual([
      { column: 'storm', desc: false }, { column: 'wind_kt', desc: true },
    ]);
  });

  it('rejects invalid directions and undeclared sort properties', () => {
    expect(querySortSchema.safeParse({ column: 'time', desc: 'false' }).success).toBe(false);
    expect(querySortSchema.safeParse({ column: 'time', direction: 'asc' }).success).toBe(false);
  });
});
