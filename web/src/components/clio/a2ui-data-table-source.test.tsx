import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ artifactTableQuery: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';
import { columnKindFromRows, dataTableComponentSchema, mergeFilters } from './a2ui-data-table';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const TEST_CATALOG_ID = 'test://a2ui-data-table-source';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [...KERNEL_COMPONENTS.values()],
  [...KERNEL_FUNCTIONS.values()],
);

function buildSurface(components: Record<string, unknown>[]) {
  const surfaceId = 'table-surface';
  const processor = new MessageProcessor([testCatalog], async () => undefined, {
    version: 'v0.9.1',
  });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId, catalogId: TEST_CATALOG_ID } },
    { version: 'v0.9.1', updateComponents: { surfaceId, components } },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the test surface to exist');
  return surface;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('clio.data-table.v1 schema', () => {
  it('accepts inline rows with columns and refuses rows together with dataUri', () => {
    const inline = dataTableComponentSchema.safeParse({
      columns: ['station'],
      rows: [{ station: 'MTA1' }],
    });
    expect(inline.success).toBe(true);

    const both = dataTableComponentSchema.safeParse({
      columns: ['station'],
      rows: [{ station: 'MTA1' }],
      dataUri: 'artifact://artifact_stations01',
    });
    expect(both.success).toBe(false);
  });

  it('requires columns alongside inline rows, but not alongside dataUri', () => {
    const rowsWithoutColumns = dataTableComponentSchema.safeParse({
      rows: [{ station: 'MTA1' }],
    });
    expect(rowsWithoutColumns.success).toBe(false);

    const dataUriWithoutColumns = dataTableComponentSchema.safeParse({
      dataUri: 'artifact://artifact_stations01',
      dataQuery: { columns: ['station'], limit: 10 },
    });
    expect(dataUriWithoutColumns.success).toBe(true);
  });

  it('refuses dataQuery without dataUri', () => {
    const result = dataTableComponentSchema.safeParse({
      columns: ['station'],
      rows: [{ station: 'MTA1' }],
      dataQuery: { limit: 10 },
    });
    expect(result.success).toBe(false);
  });

  it('requires columns alongside dataQuery.aggregate', () => {
    const result = dataTableComponentSchema.safeParse({
      dataUri: 'artifact://artifact_events01',
      dataQuery: { aggregate: { groupBy: ['station'], metrics: [{ column: 'magnitude', fn: 'max' }] } },
    });
    expect(result.success).toBe(false);
  });

  it('requires selectionField when selection is bound to a path', () => {
    const unbound = dataTableComponentSchema.safeParse({
      columns: ['station'],
      rows: [{ station: 'MTA1' }],
    });
    expect(unbound.success).toBe(true);

    const boundWithoutField = dataTableComponentSchema.safeParse({
      columns: ['station'],
      rows: [{ station: 'MTA1' }],
      selection: { path: '/selection/station' },
    });
    expect(boundWithoutField.success).toBe(false);

    const boundWithField = dataTableComponentSchema.safeParse({
      columns: ['station'],
      rows: [{ station: 'MTA1' }],
      selection: { path: '/selection/station' },
      selectionField: 'station',
    });
    expect(boundWithField.success).toBe(true);
  });
});

describe('mergeFilters', () => {
  it('layers a text and a range filter onto the producer base filter, never replacing it', () => {
    const merged = mergeFilters(
      [{ column: 'status', op: 'eq', value: 'reviewed' }],
      new Map<string, { kind: 'text'; contains: string } | { kind: 'range'; min?: number; max?: number }>([
        ['place', { kind: 'text', contains: 'california' }],
        ['magnitude', { kind: 'range', min: 3, max: undefined }],
      ]),
    );
    expect(merged).toEqual([
      { column: 'status', op: 'eq', value: 'reviewed' },
      { column: 'place', op: 'contains', value: 'california' },
      { column: 'magnitude', op: 'range', value: [3, null] },
    ]);
  });

  it('omits an empty text filter and an empty range', () => {
    const merged = mergeFilters(
      undefined,
      new Map([
        ['place', { kind: 'text' as const, contains: '' }],
        ['magnitude', { kind: 'range' as const, min: undefined, max: undefined }],
      ]),
    );
    expect(merged).toEqual([]);
  });
});

describe('columnKindFromRows', () => {
  it('reads number vs. text from the first non-null sampled value', () => {
    const rows = [{ magnitude: null, place: 'CA' }, { magnitude: 4.2, place: 'NV' }];
    expect(columnKindFromRows(rows, 'magnitude')).toBe('number');
    expect(columnKindFromRows(rows, 'place')).toBe('text');
  });
});

describe('clio.data-table.v1 dataUri rendering', () => {
  it('derives columns from the queried result when the producer names none', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { station: ['MTA1', 'PBO2'], magnitude: [3.1, 4.2] },
      totalRows: 2,
      matchedRows: 2,
      returnedRows: 2,
      truncated: false,
      downsample: { mode: 'none' },
    });
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['table'] },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        dataUri: 'artifact://artifact_events01',
        dataQuery: { columns: ['station', 'magnitude'], limit: 10 },
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: /station/iu })).toBeVisible();
    expect(within(table).getByRole('columnheader', { name: /magnitude/iu })).toBeVisible();
    expect(within(table).getByRole('cell', { name: 'PBO2' })).toBeVisible();
    // The viewer's own paging takes over the row budget (the default page
    // size, not the producer's one-shot `limit`) and adds `offset`; the
    // producer's own projection is preserved as written.
    expect(repository.artifactTableQuery).toHaveBeenCalledWith(
      'artifact_events01',
      expect.objectContaining({ columns: ['station', 'magnitude'], limit: 50, offset: 0 }),
      expect.anything(),
    );
  });

  it('asks the server for every column when neither columns nor dataQuery.columns is given', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { station: ['MTA1'], magnitude: [3.1], depth: [10] },
      totalRows: 1,
      matchedRows: 1,
      returnedRows: 1,
      truncated: false,
      downsample: { mode: 'none' },
    });
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['table'] },
      { id: 'table', component: 'clio.data-table.v1', dataUri: 'artifact://artifact_events01' },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: /depth/iu })).toBeVisible();
    const [, requestBody] = repository.artifactTableQuery.mock.calls[0]!;
    expect(requestBody).not.toHaveProperty('columns');
  });

  it('highlights and writes selection through the static selectionField, not the first column', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { station: ['MTA1', 'PBO2'], magnitude: [3.1, 4.2] },
      totalRows: 2,
      matchedRows: 2,
      returnedRows: 2,
      truncated: false,
      downsample: { mode: 'none' },
    });
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['table'] },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        dataUri: 'artifact://artifact_events01',
        dataQuery: { columns: ['station', 'magnitude'], limit: 10 },
        selectionField: 'station',
        selection: { path: '/selection/events' },
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('cell', { name: 'PBO2' }));
    expect(surface.dataModel.get('/selection/events')).toMatchObject({
      field: 'station',
      values: ['PBO2'],
    });
  });

  it('pages through a dataset larger than one page via offset, never truncating it', async () => {
    const firstPage = Array.from({ length: 50 }, (_unused, index) => `S${index}`);
    const secondPage = Array.from({ length: 20 }, (_unused, index) => `S${index + 50}`);
    repository.artifactTableQuery
      .mockResolvedValueOnce({
        schema: [],
        columns: { station: firstPage },
        totalRows: 70,
        matchedRows: 70,
        returnedRows: 50,
        truncated: false,
        downsample: { mode: 'none' },
      })
      .mockResolvedValueOnce({
        schema: [],
        columns: { station: secondPage },
        totalRows: 70,
        matchedRows: 70,
        returnedRows: 20,
        truncated: false,
        downsample: { mode: 'none' },
      });
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['table'] },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        dataUri: 'artifact://artifact_events01',
        dataQuery: { columns: ['station'] },
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByText('S0')).toBeVisible();
    expect(screen.queryByText('S50')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /go to next page/iu }));

    await waitFor(() => expect(screen.getByText('S50')).toBeVisible());
    expect(screen.queryByText('S0')).not.toBeInTheDocument();
    expect(repository.artifactTableQuery).toHaveBeenLastCalledWith(
      'artifact_events01',
      expect.objectContaining({ limit: 50, offset: 50 }),
      expect.anything(),
    );
  });
});
