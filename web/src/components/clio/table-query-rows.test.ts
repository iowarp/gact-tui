import { TransportError } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { STUDY_VIEW_POLL_MS } from '@/lib/runtime-limits';
import {
  TABLE_DATA_URI,
  artifactIdFromDataUri,
  columnarToRows,
  studySourceFromDataUri,
  studySourceQueryOptions,
  tableQueryErrorMessage,
} from './table-query-rows';

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

describe('study sources', () => {
  it('reads the study and source of a study:// reference, and nothing else', () => {
    expect(studySourceFromDataUri('study://e_abc123/measurements')).toEqual({
      study: 'e_abc123',
      source: 'measurements',
    });
    expect(studySourceFromDataUri('study://e_abc123/records/board')).toEqual({
      study: 'e_abc123',
      source: 'records/board',
    });
    expect(studySourceFromDataUri('study://e_abc123/notes')).toBeUndefined();
    expect(studySourceFromDataUri('artifact://artifact_a')).toBeUndefined();
    expect(artifactIdFromDataUri('study://e_abc123/entries')).toBeUndefined();
  });

  it('accepts a study source wherever a tabular dataUri is accepted', () => {
    expect(TABLE_DATA_URI.test('artifact://artifact_a')).toBe(true);
    expect(TABLE_DATA_URI.test('study://e_1/entries')).toBe(true);
    expect(TABLE_DATA_URI.test('study://e_1/records/readings')).toBe(true);
    expect(TABLE_DATA_URI.test('study://e_1/records/a/b')).toBe(false);
    expect(TABLE_DATA_URI.test('https://example.test/a.csv')).toBe(false);
  });

  it('is never cached as immutable; plugin records also poll while shown', () => {
    const measurements = studySourceQueryOptions({ study: 'e_1', source: 'measurements' });
    expect(measurements.staleTime).toBe(0);
    expect(measurements.refetchInterval).toBe(false);
    const records = studySourceQueryOptions({ study: 'e_1', source: 'records/board' });
    expect(records.staleTime).toBe(0);
    expect(records.refetchInterval).toBe(STUDY_VIEW_POLL_MS);
    expect(records.refetchIntervalInBackground).toBe(false);
  });

  it('says when the study is not on this server', () => {
    const error = new TransportError('no study', 404, 'study_not_found');
    expect(tableQueryErrorMessage(error)).toBe('the study is not on this server.');
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
