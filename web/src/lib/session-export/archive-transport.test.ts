import { describe, expect, it } from 'vitest';
import { ArchiveTransport } from './archive-transport';
import {
  ClioRepository,
  type SessionReviewSnapshot,
  type ArtifactTableQueryResult,
} from '@clio/core/v3';
import { queryArchiveTable } from './archive-table-query';

const source: ArtifactTableQueryResult = {
  schema: [
    { name: 'plant', type: 'string' },
    { name: 'area', type: 'float64' },
  ],
  columns: { plant: ['A', 'B', 'A', 'C'], area: [2, 100, 4, 80] },
  totalRows: 4,
  returnedRows: 4,
  truncated: false,
  downsample: { mode: 'none' },
};
const snapshot: SessionReviewSnapshot = {
  responses: { 'GET /image': { bytes: btoa('image bytes') } },
  sessions: {},
  tables: { artifact_table: source },
  failures: [],
};

describe('offline archive transport', () => {
  it('replays the captured custody redirect without granting uncaptured file access', async () => {
    const transport = new ArchiveTransport({
      ...snapshot,
      responses: {
        ...snapshot.responses,
        'GET /v1/owned-image': { bytes: btoa('image bytes') },
        'GET /v1/artifacts/image/bytes': {
          error: {
            message: 'workspace-owned',
            status: 409,
            code: 'custody_not_cas',
            details: { fetch_via: '/v1/owned-image' },
          },
        },
      },
    });
    const bytes = await new ClioRepository(transport).readA2uiReferenceBytes({
      kind: 'artifact',
      uri: 'artifact://image',
      artifact_id: 'image',
      workspace_id: 'ws',
      name: 'image.png',
      media_type: 'image/png',
      fetch_path: '/v1/artifacts/image/bytes',
    });
    expect(new TextDecoder().decode(bytes)).toBe('image bytes');
  });
  it('reads bytes locally and refuses uncaptured content and live mutations', async () => {
    const transport = new ArchiveTransport(snapshot);
    expect(
      Array.from(
        await transport.request({ method: 'GET', path: '/image', decode: (v) => v as Uint8Array }),
      ),
    ).toEqual(Array.from(new TextEncoder().encode('image bytes')));
    await expect(
      transport.request({ method: 'GET', path: '/missing', decode: (v) => v }),
    ).rejects.toThrow('not captured');
    await expect(
      transport.request({ method: 'POST', path: '/v1/sessions/x/a2ui/actions', decode: (v) => v }),
    ).rejects.toThrow('offline review');
  });
  it('filters, sorts, aggregates and pages captured source rows independently', async () => {
    const transport = new ArchiveTransport(snapshot);
    const query = (body: unknown) =>
      transport.request({
        method: 'POST',
        path: '/v1/artifacts/artifact_table/table-query',
        body,
        decode: (v) => v as ArtifactTableQueryResult,
      });
    const filtered = await query({
      columns: ['area'],
      filter: [{ column: 'plant', op: 'eq', value: 'A' }],
      sort: [{ column: 'area', desc: true }],
      limit: 1,
      offset: 1,
    });
    expect(filtered.columns).toEqual({ area: [2] });
    expect(filtered.matchedRows).toBe(2);
    const aggregated = await query({
      columns: ['plant', 'area_mean'],
      aggregate: { groupBy: ['plant'], metrics: [{ column: 'area', fn: 'mean' }] },
      limit: 10,
    });
    expect(aggregated.columns).toEqual({ plant: ['A', 'B', 'C'], area_mean: [3, 100, 80] });
  });
});

it('casts choice values using column types and reports invalid casts', () => {
  const table = {
    ...source,
    schema: [
      { name: 'plant', type: 'int64' },
      { name: 'area', type: 'float64' },
    ],
    columns: { plant: [28967, 28968], area: [2, 4] },
    returnedRows: 2,
    totalRows: 2,
  };
  expect(
    queryArchiveTable(table, {
      columns: [],
      filter: [{ column: 'plant', op: 'eq', value: '28967' }],
      limit: 10,
    }).columns.plant,
  ).toEqual([28967]);
  expect(
    queryArchiveTable(table, {
      columns: [],
      filter: [{ column: 'plant', op: 'in', value: ['28967', '28968'] }],
      limit: 10,
    }).returnedRows,
  ).toBe(2);
  expect(() =>
    queryArchiveTable(table, {
      columns: [],
      filter: [{ column: 'plant', op: 'eq', value: 'wrong' }],
      limit: 10,
    }),
  ).toThrow('cast to int64');
});

it('keeps row identities while sampling the whole extent, filtering and sorting', () => {
  const table: ArtifactTableQueryResult = {
    ...source,
    schema: [
      { name: 'x', type: 'int64' },
      { name: 'y', type: 'float64' },
    ],
    columns: {
      x: Array.from({ length: 10001 }, (_, i) => i),
      y: Array.from({ length: 10001 }, (_, i) => (i === 4000 ? 90000 : i)),
    },
    rowKey: { column: '__row_key', values: Array.from({ length: 10001 }, (_, i) => `row-${i}`) },
    totalRows: 10001,
    returnedRows: 10001,
  };
  const sampled = queryArchiveTable(table, { columns: ['x'], limit: 3 });
  expect(sampled.columns.x).toEqual([0, 5000, 10000]);
  expect(sampled.rowKey?.values).toEqual(['row-0', 'row-5000', 'row-10000']);
  expect(sampled.matchedRows).toBe(10001);
  const peak = queryArchiveTable(table, {
    columns: ['x'],
    limit: 5,
    downsample: { mode: 'per_entity_lttb', x: 'x', y: 'y', maxPerEntity: 5 },
  });
  expect(peak.columns.x).toContain(4000);
  expect(peak.columns.x[0]).toBe(0);
  expect(peak.columns.x.at(-1)).toBe(10000);
  const page = queryArchiveTable(table, {
    columns: ['x'],
    limit: 2,
    offset: 1,
    filter: [{ column: 'x', op: 'range', value: [9997, null] }],
    sort: [{ column: 'x', desc: true }],
  });
  expect(page.columns.x).toEqual([9999, 9998]);
  expect(page.rowKey?.values).toEqual(['row-9999', 'row-9998']);
});
