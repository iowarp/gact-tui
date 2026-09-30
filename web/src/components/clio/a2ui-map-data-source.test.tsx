import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ artifactTableQuery: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('./scientific-map-view', () => ({
  ClioScientificMapView: () => <div data-testid="map-canvas" />,
}));
// The side list virtualizes with `@tanstack/react-virtual` (#1533 MEDIUM 6 —
// scaling past one DOM node per point); jsdom never resolves a real scroll
// container height, so — same as every other virtualized list in this
// codebase (transcript-minimap.test.tsx, conversation-activity.test.tsx) —
// stub it to render every row, keeping these tests about selection/filter
// behavior rather than virtualization mechanics.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 56,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: 56,
        start: index * 56,
      })),
  }),
}));

import { useState } from 'react';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';
import { mapComponentSchema, pointsFromRows } from './a2ui-map';
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

const TEST_CATALOG_ID = 'test://a2ui-map-data-source';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [...KERNEL_COMPONENTS.values()],
  [...KERNEL_FUNCTIONS.values()],
);

function buildSurface(components: Record<string, unknown>[]) {
  const surfaceId = 'map-surface';
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

describe('clio.map.v1 schema', () => {
  it('keeps the schema a plain object so the binder finds the selection binding', () => {
    expect((mapComponentSchema._def as { typeName: string }).typeName).toBe('ZodObject');
    expect(mapComponentSchema.shape.selection).toBeDefined();
  });

  it('accepts inline points and refuses points together with dataUri', () => {
    const inline = mapComponentSchema.safeParse({
      points: [{ id: 's1', label: 'Station 1', latitude: 1, longitude: 2 }],
    });
    expect(inline.success).toBe(true);

    const both = mapComponentSchema.safeParse({
      points: [{ id: 's1', label: 'Station 1', latitude: 1, longitude: 2 }],
      dataUri: 'artifact://artifact_stations01',
      latitudeField: 'lat',
      longitudeField: 'lon',
      labelField: 'station',
    });
    expect(both.success).toBe(false);

    const neither = mapComponentSchema.safeParse({});
    expect(neither.success).toBe(false);
  });

  it('requires latitudeField/longitudeField/labelField alongside dataUri', () => {
    const missingFields = mapComponentSchema.safeParse({
      dataUri: 'artifact://artifact_stations01',
    });
    expect(missingFields.success).toBe(false);

    const withFields = mapComponentSchema.safeParse({
      dataUri: 'artifact://artifact_stations01',
      latitudeField: 'lat',
      longitudeField: 'lon',
      labelField: 'station',
    });
    expect(withFields.success).toBe(true);
  });

  it('refuses dataQuery without dataUri', () => {
    const result = mapComponentSchema.safeParse({
      points: [{ id: 's1', label: 'Station 1', latitude: 1, longitude: 2 }],
      dataQuery: { limit: 10 },
    });
    expect(result.success).toBe(false);
  });

  it('requires selectionField when selection is bound to a path', () => {
    const boundWithoutField = mapComponentSchema.safeParse({
      points: [{ id: 's1', label: 'Station 1', latitude: 1, longitude: 2 }],
      selection: { path: '/selection/stations' },
    });
    expect(boundWithoutField.success).toBe(false);

    const boundWithField = mapComponentSchema.safeParse({
      points: [{ id: 's1', label: 'Station 1', latitude: 1, longitude: 2 }],
      selection: { path: '/selection/stations' },
      selectionField: 'id',
    });
    expect(boundWithField.success).toBe(true);
  });
});

describe('pointsFromRows', () => {
  it('maps rows to points by the producer field names, synthesizing an id when idField is absent', () => {
    const points = pointsFromRows(
      [
        { lat: 34.1, lon: -118.3, station: 'GNSS01', place: 'LA' },
        { lat: 37.9, lon: -122.6, station: 'GNSS02', place: 'Mount Tam' },
      ],
      { latitudeField: 'lat', longitudeField: 'lon', labelField: 'station', detailField: 'place' },
    );
    expect(points).toEqual([
      {
        id: 'row-0',
        label: 'GNSS01',
        latitude: 34.1,
        longitude: -118.3,
        detail: 'LA',
        category: undefined,
      },
      {
        id: 'row-1',
        label: 'GNSS02',
        latitude: 37.9,
        longitude: -122.6,
        detail: 'Mount Tam',
        category: undefined,
      },
    ]);
  });

  it('skips a row with a non-finite coordinate or a missing label instead of drawing it wrong', () => {
    const points = pointsFromRows(
      [
        { lat: 'not-a-number', lon: -118.3, station: 'GNSS01' },
        { lat: 37.9, lon: -122.6, station: null },
        { lat: 40, lon: -100, station: 'GNSS03' },
      ],
      { latitudeField: 'lat', longitudeField: 'lon', labelField: 'station' },
    );
    expect(points).toHaveLength(1);
    expect(points[0]!.label).toBe('GNSS03');
  });

  it('carries the selectionField column into selectionValue, independent of id/label/category', () => {
    const points = pointsFromRows(
      [{ lat: 34.1, lon: -118.3, station: 'GNSS01', event_id: 'evt-42' }],
      {
        latitudeField: 'lat',
        longitudeField: 'lon',
        labelField: 'station',
        idField: 'station',
        selectionField: 'event_id',
      },
    );
    expect(points[0]!.id).toBe('GNSS01');
    expect(points[0]!.selectionValue).toBe('evt-42');
  });
});

describe('clio.map.v1 dataUri rendering', () => {
  it('draws every referenced point once the table query resolves', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { lat: [34.1, 35.2], lon: [-118.3, -117.1], station: ['GNSS01', 'GNSS02'] },
      totalRows: 2,
      matchedRows: 2,
      returnedRows: 2,
      truncated: false,
      downsample: { mode: 'none' },
    });
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['map'] },
      {
        id: 'map',
        component: 'clio.map.v1',
        dataUri: 'artifact://artifact_stations01',
        latitudeField: 'lat',
        longitudeField: 'lon',
        labelField: 'station',
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument());
    expect(await screen.findByText('2 labeled locations')).toBeVisible();
    expect(repository.artifactTableQuery).toHaveBeenCalledWith(
      'artifact_stations01',
      expect.objectContaining({ columns: expect.arrayContaining(['lat', 'lon', 'station']) }),
      expect.anything(),
    );
  });

  it("layers the viewer's own filter popover onto the producer's dataQuery, never replacing it", async () => {
    repository.artifactTableQuery.mockResolvedValue({
      columns: { category: ['GNSS'], lat: [34.1], lon: [-118.3], station: ['GNSS01'] },
      downsample: { mode: 'none' },
      matchedRows: 1,
      returnedRows: 1,
      schema: [],
      totalRows: 2,
      truncated: false,
    });
    const user = userEvent.setup();
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['map'] },
      {
        id: 'map',
        component: 'clio.map.v1',
        categoryField: 'category',
        dataQuery: { filter: [{ column: 'lat', op: 'range', value: [30, null] }] },
        dataUri: 'artifact://artifact_stations01',
        labelField: 'station',
        latitudeField: 'lat',
        longitudeField: 'lon',
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));
    await screen.findByText('1 labeled locations');
    await waitFor(() => expect(repository.artifactTableQuery).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /^filters/iu }));
    await user.type(screen.getByLabelText('Filter category, contains'), 'gnss');

    await waitFor(
      () =>
        expect(repository.artifactTableQuery).toHaveBeenLastCalledWith(
          'artifact_stations01',
          expect.objectContaining({
            filter: [
              { column: 'lat', op: 'range', value: [30, null] },
              { column: 'category', op: 'contains', value: 'gnss' },
            ],
          }),
          expect.anything(),
        ),
      { timeout: 2000 },
    );
  });

  it('"Reference this" attaches the dataset, filters, and how many points are shown', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      columns: { lat: [34.1], lon: [-118.3], station: ['GNSS01'] },
      downsample: { mode: 'none' },
      matchedRows: 2,
      returnedRows: 1,
      schema: [],
      totalRows: 2,
      truncated: true,
    });
    const user = userEvent.setup();
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['map'] },
      {
        id: 'map',
        component: 'clio.map.v1',
        dataQuery: { filter: [{ column: 'lat', op: 'range', value: [30, null] }] },
        dataUri: 'artifact://artifact_stations01',
        idField: 'station',
        labelField: 'station',
        latitudeField: 'lat',
        longitudeField: 'lon',
        title: 'GNSS stations',
      },
    ]);

    render(wrap(<WithComposer><A2uiSurface surface={surface} /></WithComposer>));
    await screen.findByText('1 labeled locations');

    await user.click(screen.getByRole('button', { name: 'Reference this' }));

    const attached = screen.getByRole('list', { name: 'Attached selections' });
    expect(attached).toHaveTextContent('GNSS stations');
    expect(attached).toHaveTextContent('artifact_stations01');
    expect(attached).toHaveTextContent('1 of 2 points');
  });

  it('states a table-query refusal instead of a blank map', async () => {
    // A 4xx TransportError is never retried, so this resolves within the test's default timeout.
    repository.artifactTableQuery.mockRejectedValue(
      new TransportError('one or more requested columns do not exist', 400, 'columns_not_found', {
        missing: ['lat'],
      }),
    );
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['map'] },
      {
        id: 'map',
        component: 'clio.map.v1',
        dataUri: 'artifact://artifact_stations01',
        latitudeField: 'lat',
        longitudeField: 'lon',
        labelField: 'station',
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByText(/Map unavailable/u)).toBeInTheDocument();
  });

  it('links a dataUri map to a table over one selectionField, in both directions', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: {
        lat: [34.1, 35.2],
        lon: [-118.3, -117.1],
        station: ['GNSS01', 'GNSS02'],
        event_id: ['evt-1', 'evt-2'],
      },
      totalRows: 2,
      matchedRows: 2,
      returnedRows: 2,
      truncated: false,
      downsample: { mode: 'none' },
    });
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['map', 'table'] },
      {
        id: 'map',
        component: 'clio.map.v1',
        dataUri: 'artifact://artifact_stations01',
        latitudeField: 'lat',
        longitudeField: 'lon',
        labelField: 'station',
        selectionField: 'event_id',
        selection: { path: '/selection/events' },
      },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        dataUri: 'artifact://artifact_stations01',
        dataQuery: { columns: ['station', 'event_id'], limit: 10 },
        selectionField: 'event_id',
        selection: { path: '/selection/events' },
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    await screen.findByText('GNSS02');
    const table = await screen.findByRole('table');

    // Map -> table: clicking the second map point selects its event_id, and the
    // table highlights the matching row.
    fireEvent.click(screen.getByRole('button', { name: /GNSS02/u }));
    expect(surface.dataModel.get('/selection/events')).toEqual({
      field: 'event_id',
      values: ['evt-2'],
      source: 'map',
    });
    await waitFor(() =>
      expect(within(table).getByText('GNSS02').closest('tr')).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );

    // Table -> map: clicking the first table row selects its event_id, and the
    // map's own button reflects it as pressed.
    fireEvent.click(within(table).getByText('GNSS01'));
    expect(surface.dataModel.get('/selection/events')).toEqual({
      field: 'event_id',
      values: ['evt-1'],
      source: 'table',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /GNSS01/u })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });
});
