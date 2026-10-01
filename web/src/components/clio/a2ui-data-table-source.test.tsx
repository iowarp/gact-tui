import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ artifactTableExport: vi.fn(), artifactTableQuery: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';
import {
  columnKindFromRows,
  dataTableComponentSchema,
  mergeFilters,
  resolveEffectiveSort,
} from './a2ui-data-table';
import { ClioComposerAnnotations } from './composer-annotations';
import { SelectionActionsProvider } from './selection-actions';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import type { ComposerAnnotation } from '@/lib/composer-annotations';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A composer stand-in, inside the provider, so "Reference this" has somewhere real to attach to. */
function ComposerAndChildren({ children }: { children: ReactNode }) {
  const [annotations, setAnnotations] = useState<readonly ComposerAnnotation[]>([]);
  useReferenceThisSelectionAction({ annotations, onAnnotationsChange: setAnnotations }, () => {});
  return (
    <>
      {children}
      <ClioComposerAnnotations
        annotations={annotations}
        onRemove={(gone) => setAnnotations(annotations.filter((item) => item !== gone))}
      />
    </>
  );
}

function WithComposer({ children }: { children: ReactNode }) {
  return (
    <SelectionActionsProvider>
      <ComposerAndChildren>{children}</ComposerAndChildren>
    </SelectionActionsProvider>
  );
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

describe('resolveEffectiveSort', () => {
  it("uses the viewer's own override when set", () => {
    expect(resolveEffectiveSort({ column: 'magnitude', desc: false }, [
      { column: 'time', desc: true },
    ])).toEqual([{ column: 'magnitude', desc: false }]);
  });

  it("falls back to the producer's own base sort, unchanged, once the override is cleared", () => {
    expect(resolveEffectiveSort(undefined, [{ column: 'time', desc: true }])).toEqual([
      { column: 'time', desc: true },
    ]);
  });

  it('sends no sort at all when neither the viewer nor the producer named one', () => {
    expect(resolveEffectiveSort(undefined, undefined)).toEqual([]);
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
      expect.objectContaining({ columns: ['station', 'magnitude'], limit: 10, offset: 0 }),
      expect.anything(),
    );
  });

  it('"Reference this" attaches the dataset, active filter, page, and a preview, with a re-queryable JSON block', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { magnitude: [6.1], place: ['Eastern Sierra'], station: ['eq0342'] },
      totalRows: 270,
      matchedRows: 270,
      returnedRows: 1,
      truncated: true,
      downsample: { mode: 'none' },
    });
    const user = userEvent.setup();
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['table'] },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        accessibility: { label: 'Earthquake table' },
        dataUri: 'artifact://artifact_events01',
        dataQuery: {
          columns: ['station', 'magnitude', 'place'],
          filter: [{ column: 'magnitude', op: 'range', value: [2, null] }],
        },
      },
    ]);

    render(wrap(<WithComposer><A2uiSurface surface={surface} /></WithComposer>));
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Reference this' }));

    // The card itself: a plain-language label and one-line summary, never
    // the dataset id or the full markdown block (#1533 coordinator review —
    // those belong to the full reference, shown on request via the expand
    // control below, and sent with the message; not flattened onto the card).
    const attached = screen.getByRole('list', { name: 'Attached selections' });
    expect(attached).toHaveTextContent('Earthquake table');
    expect(attached).toHaveTextContent('rows 1–1 of 270');
    expect(attached.textContent).not.toContain('artifact_events01');

    await user.click(screen.getByRole('button', { name: /Show the full .* reference/u }));
    const popover = await screen.findByText('Sent with your next message, exactly as shown below.');
    const popoverBody = popover.closest('[data-slot="popover-content"]') as HTMLElement;
    expect(popoverBody).toHaveTextContent('artifact_events01');
    expect(popoverBody).toHaveTextContent('magnitude');
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
    const firstPage = Array.from({ length: 10 }, (_unused, index) => `S${index}`);
    const secondPage = Array.from({ length: 10 }, (_unused, index) => `S${index + 10}`);
    repository.artifactTableQuery
      .mockResolvedValueOnce({
        schema: [],
        columns: { station: firstPage },
        totalRows: 70,
        matchedRows: 70,
        returnedRows: 10,
        truncated: false,
        downsample: { mode: 'none' },
      })
      .mockResolvedValueOnce({
        schema: [],
        columns: { station: secondPage },
        totalRows: 70,
        matchedRows: 70,
        returnedRows: 10,
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
    expect(screen.queryByText('S10')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /go to next page/iu }));

    await waitFor(() => expect(screen.getByText('S10')).toBeVisible());
    expect(screen.queryByText('S0')).not.toBeInTheDocument();
    expect(repository.artifactTableQuery).toHaveBeenLastCalledWith(
      'artifact_events01',
      expect.objectContaining({ limit: 10, offset: 10 }),
      expect.anything(),
    );
  });

  it('sends sort as a list of {column, desc}, matching the server contract exactly', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [{ name: 'station', type: 'string' }],
      columns: { station: ['MTA1'] },
      totalRows: 1,
      matchedRows: 1,
      returnedRows: 1,
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

    const user = userEvent.setup();
    render(wrap(<A2uiSurface surface={surface} />));
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'station' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Asc' }));

    await waitFor(() =>
      expect(repository.artifactTableQuery).toHaveBeenLastCalledWith(
        'artifact_events01',
        expect.objectContaining({ sort: [{ column: 'station', desc: false }] }),
        expect.anything(),
      ),
    );
    // Never the old singular `{column, direction}` shape.
    const [, lastRequest] = repository.artifactTableQuery.mock.calls.at(-1)!;
    expect(lastRequest).not.toHaveProperty('sort.direction');
  });

  it('shows and sends the producer\'s own base sort until the viewer overrides it', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [{ name: 'station', type: 'string' }],
      columns: { station: ['MTA1'] },
      totalRows: 1,
      matchedRows: 1,
      returnedRows: 1,
      truncated: false,
      downsample: { mode: 'none' },
    });
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['table'] },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        dataUri: 'artifact://artifact_events01',
        dataQuery: { columns: ['station'], sort: [{ column: 'station', desc: true }] },
      },
    ]);

    const user = userEvent.setup();
    render(wrap(<A2uiSurface surface={surface} />));
    await screen.findByRole('table');
    // Seeded from the producer's own `dataQuery.sort` before the viewer ever
    // touches the header (`resolveEffectiveSort`'s "no override" branch).
    await waitFor(() =>
      expect(repository.artifactTableQuery).toHaveBeenLastCalledWith(
        'artifact_events01',
        expect.objectContaining({ sort: [{ column: 'station', desc: true }] }),
        expect.anything(),
      ),
    );
    expect(screen.getByRole('columnheader', { name: /station/iu })).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    // One click overrides it.
    await user.click(screen.getByRole('button', { name: 'station' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Asc' }));
    await waitFor(() =>
      expect(repository.artifactTableQuery).toHaveBeenLastCalledWith(
        'artifact_events01',
        expect.objectContaining({ sort: [{ column: 'station', desc: false }] }),
        expect.anything(),
      ),
    );
  });

  it('renders a real, empty table instead of loading forever when a query matches zero rows', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [
        { name: 'station', type: 'string' },
        { name: 'magnitude', type: 'double' },
      ],
      columns: { station: [], magnitude: [] },
      totalRows: 500,
      matchedRows: 0,
      returnedRows: 0,
      truncated: false,
      downsample: { mode: 'none' },
    });
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['table'] },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        dataUri: 'artifact://artifact_events01',
        dataQuery: {
          columns: ['station', 'magnitude'],
          filter: [{ column: 'magnitude', op: 'range', value: [999, null] }],
        },
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    // A real table with the SCHEMA's own column headers, not a permanent
    // "Loading rows…" skeleton (there is no `rows[0]` to name columns from
    // when zero rows match).
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: /station/iu })).toBeVisible();
    expect(within(table).getByRole('columnheader', { name: /magnitude/iu })).toBeVisible();
    expect(screen.getByText('No rows were provided for this data view.')).toBeVisible();
    expect(screen.queryByLabelText('Loading data table')).not.toBeInTheDocument();
  });

  it('keeps a way to clear the viewer\'s own filters when the query fails', async () => {
    repository.artifactTableQuery.mockRejectedValue(
      new TransportError('the artifact is not in this workspace.', 404, 'not_found'),
    );
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

    expect(await screen.findByText(/Table unavailable/u)).toBeInTheDocument();
    // No viewer filter is active yet, so there is nothing to offer clearing.
    expect(screen.queryByRole('button', { name: /clear/iu })).not.toBeInTheDocument();
  });

  it('offers to clear the viewer\'s own filters once they may be the reason a query fails', async () => {
    repository.artifactTableQuery.mockResolvedValueOnce({
      schema: [{ name: 'station', type: 'string' }],
      columns: { station: ['MTA1'] },
      totalRows: 1,
      matchedRows: 1,
      returnedRows: 1,
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
    const user = userEvent.setup();
    render(wrap(<A2uiSurface surface={surface} />));
    await screen.findByRole('table');

    // The next request (carrying the viewer's own new filter) fails.
    repository.artifactTableQuery.mockRejectedValue(
      new TransportError('the artifact is not in this workspace.', 404, 'not_found'),
    );
    await user.click(screen.getByRole('button', { name: 'station' }));
    await user.type(await screen.findByLabelText('Filter station, contains'), 'x');

    expect(await screen.findByText(/Table unavailable/u)).toBeInTheDocument();
    const clearButton = screen.getByRole('button', { name: /clear it/iu });
    await user.click(clearButton);

    // The unfiltered query is the SAME one that already succeeded at mount
    // (`IMMUTABLE_QUERY`'s infinite staleTime), so clearing serves it back
    // from cache without a further network call — proof enough is the table
    // itself reappearing with that original (unfiltered) row, not a new spy
    // call, which correctly never happens.
    expect(await screen.findByRole('table')).toBeVisible();
    expect(screen.getByText('MTA1')).toBeInTheDocument();
    expect(screen.queryByText(/Table unavailable/u)).not.toBeInTheDocument();
  });

  it('resets the viewer\'s own page, sort, and filters when the producer points at a different dataset', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [{ name: 'station', type: 'string' }],
      columns: { station: Array.from({ length: 10 }, (_unused, index) => `S${index}`) },
      totalRows: 70,
      matchedRows: 70,
      returnedRows: 10,
      truncated: false,
      downsample: { mode: 'none' },
    });
    const surfaceId = 'reset-surface';
    const processor = new MessageProcessor([testCatalog], async () => undefined, {
      version: 'v0.9.1',
    });
    const components = [
      { id: 'root', component: 'Column', children: ['table'] },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        dataUri: 'artifact://artifact_events01',
        dataQuery: { columns: ['station'] },
      },
    ];
    processor.processMessages([
      { version: 'v0.9.1', createSurface: { surfaceId, catalogId: TEST_CATALOG_ID } },
      { version: 'v0.9.1', updateComponents: { surfaceId, components } },
    ] as A2uiMessage[]);
    const surface = processor.model.getSurface(surfaceId)!;

    const { rerender } = render(wrap(<A2uiSurface surface={surface} />));
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /go to next page/iu }));
    await waitFor(() =>
      expect(repository.artifactTableQuery).toHaveBeenLastCalledWith(
        'artifact_events01',
        expect.objectContaining({ offset: 10 }),
        expect.anything(),
      ),
    );

    // A new artifact for the SAME component: the viewer's own page 2 must
    // not silently carry over and hide every row of the new dataset.
    processor.processMessages([
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId,
          components: [
            {
              id: 'table',
              component: 'clio.data-table.v1',
              dataUri: 'artifact://artifact_events02',
              dataQuery: { columns: ['station'] },
            },
          ],
        },
      },
    ] as A2uiMessage[]);
    rerender(wrap(<A2uiSurface surface={processor.model.getSurface(surfaceId)!} />));

    await waitFor(() =>
      expect(repository.artifactTableQuery).toHaveBeenLastCalledWith(
        'artifact_events02',
        expect.objectContaining({ offset: 0 }),
        expect.anything(),
      ),
    );
  });
});

