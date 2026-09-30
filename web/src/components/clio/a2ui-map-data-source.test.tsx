import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';
import { mapComponentSchema, pointsFromRows } from './a2ui-map';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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
