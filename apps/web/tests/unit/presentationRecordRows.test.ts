import { describe, expect, it } from 'vitest';
import {
  datasetRows as ndpDatasetRows,
  recordRows as recordsResultRows,
} from '../../src/presentationRows.js';
import { summarizeToolResultPresentation } from '../../src/presentation.js';

describe('presentationRecordRows', () => {
  it('summarizes NDP dataset items with declared count and bounded samples', () => {
    expect(
      ndpDatasetRows({
        datasets: {
          count: 6,
          items: [
            { title: 'EarthScope Stations', status: 'ready' },
            { title: 'GNSS Daily' },
            { title: 'Station Metadata' },
            { title: 'Time Series' },
            { title: 'Extra' },
          ],
        },
      }),
    ).toEqual([
      { label: 'datasets', value: '6' },
      { label: 'sample', value: 'EarthScope Stations · status: ready' },
      { label: 'sample', value: 'GNSS Daily' },
      { label: 'sample', value: 'Station Metadata' },
      { label: 'sample', value: 'Time Series' },
      { label: 'more', value: '1 more' },
    ]);
  });

  it('summarizes generic records from nested containers', () => {
    expect(
      recordsResultRows({
        total_count: 2,
        features: {
          records: [
            {
              attributes: {
                station: 'P475',
                distance_km: 9.48,
                county: 'San Diego',
              },
            },
            { id: 'SIO5', status: 'active' },
          ],
        },
      }),
    ).toEqual([
      { label: 'records', value: '2' },
      { label: 'sample', value: 'P475 · distance: 9.48 · area: San Diego' },
      { label: 'sample', value: 'SIO5 · status: active' },
    ]);
  });

  it('handles scalar records and unnamed record objects', () => {
    expect(recordsResultRows({ items: ['alpha', { severity: 'high' }] })).toEqual([
      { label: 'records', value: '2' },
      { label: 'sample', value: 'alpha' },
      { label: 'sample', value: '(unnamed) · severity: high' },
    ]);
  });

  it('preserves summarizeToolResultPresentation record behavior', () => {
    expect(
      summarizeToolResultPresentation(
        'geo_filter_points',
        JSON.stringify({
          count: 1,
          points: [{ site: 'P475', distance_km: 9.48 }],
          output_path: '/tmp/ranking.csv',
        }),
      ),
    ).toEqual({
      title: 'records result',
      raw: '{"count":1,"points":[{"site":"P475","distance_km":9.48}],"output_path":"/tmp/ranking.csv"}',
      rows: [
        { label: 'records', value: '1' },
        { label: 'sample', value: 'P475 · distance: 9.48' },
        { label: 'artifact', value: '/tmp/ranking.csv' },
      ],
    });
  });
});
