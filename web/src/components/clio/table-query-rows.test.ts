import { TransportError } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { artifactIdFromDataUri, columnarToRows, tableQueryErrorMessage } from './table-query-rows';

describe('artifactIdFromDataUri', () => {
  it('extracts the artifact id from a well-formed dataUri', () => {
    expect(artifactIdFromDataUri('artifact://artifact_stations01')).toBe('artifact_stations01');
  });

  it('returns undefined for a raw path, an unregistered scheme, or nothing at all', () => {
    expect(artifactIdFromDataUri('artifact_stations01')).toBeUndefined();
    expect(artifactIdFromDataUri('https://example.test/data.csv')).toBeUndefined();
    expect(artifactIdFromDataUri(undefined)).toBeUndefined();
  });
});

describe('columnarToRows', () => {
  it('converts columnar arrays to row objects, in order', () => {
    const rows = columnarToRows({ lat: [1, 2], lon: [3, 4] }, 2);
    expect(rows).toEqual([
      { lat: 1, lon: 3 },
      { lat: 2, lon: 4 },
    ]);
  });

  it('fills a missing cell with null rather than leaving it undefined', () => {
    const rows = columnarToRows({ lat: [1, null] }, 2);
    expect(rows[1]!.lat).toBeNull();
  });
});

describe('tableQueryErrorMessage', () => {
  it('states an unknown-columns refusal by name', () => {
    const error = new TransportError('bad columns', 400, 'columns_not_found', { missing: ['lat'] });
    expect(tableQueryErrorMessage(error)).toContain('lat');
  });

  it('falls back to the raw message for a non-transport error', () => {
    expect(tableQueryErrorMessage(new Error('network dropped'))).toBe('network dropped');
  });

  it('states an over-ceiling limit refusal', () => {
    const error = new TransportError('too many rows', 400, 'limit_exceeds_ceiling', {
      limit: 900_000,
      max_rows: 50_000,
    });
    expect(tableQueryErrorMessage(error)).toContain('900000');
    expect(tableQueryErrorMessage(error)).toContain('50000');
  });
});
