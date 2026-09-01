import { describe, expect, it } from 'vitest';
import { parseCsvPreview } from './csv-preview';

describe('parseCsvPreview', () => {
  it('preserves typed tabular values without inventing missing cells', () => {
    const preview = parseCsvPreview('station,count,latitude\nMTA1,72,34.05\nSEAT,17,\n');

    expect(preview.columns).toEqual(['station', 'count', 'latitude']);
    expect(preview.rows).toEqual([
      { station: 'MTA1', count: 72, latitude: 34.05 },
      { station: 'SEAT', count: 17, latitude: null },
    ]);
    expect(preview.truncated).toBe(false);
  });
});
