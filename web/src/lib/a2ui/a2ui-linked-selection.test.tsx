import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no 2D canvas: charts draw with Vega's SVG renderer, and Vega
// (which probes a canvas for text metrics at import) estimates quietly.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

import type { View } from 'vega';
import type { Result } from 'vega-embed';

const repository = vi.hoisted(() => ({ artifactTableQuery: vi.fn() }));
const embedded = vi.hoisted(() => ({ views: [] as View[] }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/components/clio/scientific-map-view', () => ({
  ClioScientificMapView: () => <div data-testid="map-canvas" />,
}));
// See a2ui-map-data-source.test.tsx for why the map's side-list virtualizer
// is stubbed to render every row in tests (jsdom never resolves a real
// scroll-container height).
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
vi.mock('vega-embed', async (importOriginal) => {
  const original = await importOriginal<typeof import('vega-embed')>();
  return {
    ...original,
    default: async (...args: Parameters<typeof original.default>): Promise<Result> => {
      const result = await original.default(...args);
      embedded.views.push(result.view);
      return result;
    },
  };
});

import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';

/**
 * A chart, a data table and a map on one surface, all bound to
 * `/selection/runs`: a selection made in any of them reaches the others
 * through the surface's data model alone — the processor's server-bound
 * action handler and the repository are never called.
 */

const CATALOG_ID = 'test://linked-selection';
const catalog = new Catalog(
  CATALOG_ID,
  [...KERNEL_COMPONENTS.values()],
  [...KERNEL_FUNCTIONS.values()],
);
// The chart/table/map are all bound to one `/selection/runs` path, so — the
// actual protocol invariant a producer must uphold — they all declare the
// SAME `selectionField` name ("id"): an inline-points map (no `dataUri`) can
// only ever select by id/label/category (`isSelectablePointField`), so a
// producer wanting a chart or table to link with it authors that field name
// throughout, not a differently-named column that happens to share values.
const ROWS = [
  { t: 0, v: 1.5, id: 'a' },
  { t: 1, v: 1.2, id: 'a' },
  { t: 0, v: 2.0, id: 'b' },
  { t: 1, v: 2.4, id: 'b' },
];

/** More components for the surface: `rootChildren` are added under the root column. */
interface ExtraComponents {
  rootChildren: string[];
  components: Record<string, unknown>[];
}

const NO_EXTRA: ExtraComponents = { rootChildren: [], components: [] };

function buildSurface(extra: ExtraComponents = NO_EXTRA) {
  const surfaceId = 'linked';
  const toServer = vi.fn(async () => undefined);
  const processor = new MessageProcessor([catalog], toServer, { version: 'v0.9.1' });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId, catalogId: CATALOG_ID } },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId,
        components: [
          {
            id: 'root',
            component: 'Column',
            children: ['chart', 'table', 'map', ...extra.rootChildren],
          },
          ...extra.components,
          {
            id: 'chart',
            component: 'clio.chart.v1',
            preset: 'scatter',
            xField: 't',
            yField: 'v',
            entityField: 'id',
            data: ROWS,
            selection: { path: '/selection/runs' },
            title: 'Runs',
          },
          {
            id: 'table',
            component: 'clio.data-table.v1',
            columns: ['id', 't', 'v'],
            rows: ROWS,
            selection: { path: '/selection/runs' },
            selectionField: 'id',
          },
          {
            id: 'map',
            component: 'clio.map.v1',
            points: [
              { id: 'a', label: 'Run A', latitude: 41.8, longitude: -87.6 },
              { id: 'b', label: 'Run B', latitude: 40.7, longitude: -74.0 },
            ],
            selection: { path: '/selection/runs' },
            selectionField: 'id',
          },
        ],
      },
    },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the linked surface');
  return { surface, toServer };
}

function renderSurface(extra: ExtraComponents = NO_EXTRA) {
  const built = buildSurface(extra);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <A2uiSurface surface={built.surface} />
    </QueryClientProvider>,
  );
  return built;
}

async function chartView(): Promise<View> {
  await waitFor(() => expect(embedded.views.length).toBeGreaterThan(0), { timeout: 10_000 });
  const view = embedded.views.at(-1)!;
  await waitFor(() => expect(() => view.signal('sel_tuple_fields')).not.toThrow());
  return view;
}

function tableRow(id: string, t: number): HTMLElement {
  const table = screen.getByRole('table');
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => {
      const cells = within(candidate)
        .queryAllByRole('cell')
        .map((cell) => cell.textContent);
      return cells[0] === id && cells[1] === String(t);
    });
  if (!row) throw new Error(`No row for ${id} at ${t}`);
  return row;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  embedded.views = [];
});

describe('linked selection on one surface', () => {
  it('carries a table click to the chart and the map without a server call', async () => {
    const { surface, toServer } = renderSurface();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const view = await chartView();

    fireEvent.click(tableRow('b', 0));

    expect(surface.dataModel.get('/selection/runs')).toEqual({
      field: 'id',
      values: ['b'],
      source: 'table',
    });
    await waitFor(() => expect(view.signal('sel')).toMatchObject({ id: ['b'] }));
    expect(tableRow('b', 0)).toHaveAttribute('aria-selected', 'true');
    expect(tableRow('b', 1)).toHaveAttribute('aria-selected', 'true');
    expect(tableRow('a', 0)).not.toHaveAttribute('aria-selected');
    // The map selects the point whose id is the selected value.
    expect(screen.getByRole('button', { name: /Run B/u })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Run A/u })).toHaveAttribute('aria-pressed', 'false');

    // The chart does not echo the table's selection back.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(surface.dataModel.get('/selection/runs')).toMatchObject({ source: 'table' });
    expect(toServer).not.toHaveBeenCalled();
    expect(repository.artifactTableQuery).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  }, 20_000);

  it('carries a chart selection to the table and the map', async () => {
    const { surface, toServer } = renderSurface();
    const view = await chartView();

    // What a click on run "a" does inside Vega-Lite.
    await act(async () => {
      view.signal('sel_tuple', {
        unit: '',
        fields: view.signal('sel_tuple_fields'),
        values: ['a'],
      });
      await view.runAsync();
    });

    await waitFor(() =>
      expect(surface.dataModel.get('/selection/runs')).toEqual({
        field: 'id',
        values: ['a'],
        source: 'chart',
      }),
    );
    await waitFor(() => expect(tableRow('a', 0)).toHaveAttribute('aria-selected', 'true'));
    expect(tableRow('b', 0)).not.toHaveAttribute('aria-selected');
    expect(screen.getByRole('button', { name: /Run A/u })).toHaveAttribute('aria-pressed', 'true');
    expect(toServer).not.toHaveBeenCalled();
  }, 20_000);

  it('carries a map click to the chart', async () => {
    const { surface } = renderSurface();
    const view = await chartView();

    fireEvent.click(screen.getByRole('button', { name: /Run B/u }));

    expect(surface.dataModel.get('/selection/runs')).toEqual({
      field: 'id',
      values: ['b'],
      source: 'map',
    });
    // All three components share `selectionField: 'id'`, so the chart adopts
    // the map's click same as it would its own — but does not echo it back
    // (checked below) as a fresh `source: 'chart'` write.
    await waitFor(() => expect(view.signal('sel')).toMatchObject({ id: ['b'] }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(surface.dataModel.get('/selection/runs')).toMatchObject({ source: 'map' });
  }, 20_000);

  it('follows a selection the producer writes into the data model', async () => {
    const { surface } = renderSurface();
    const view = await chartView();

    act(() => {
      surface.dataModel.set('/selection/runs', { field: 'id', values: ['a', 'b'] });
    });

    await waitFor(() => expect(view.signal('sel')).toMatchObject({ id: ['a', 'b'] }));
    expect(tableRow('a', 1)).toHaveAttribute('aria-selected', 'true');
    expect(tableRow('b', 1)).toHaveAttribute('aria-selected', 'true');
  }, 20_000);

  it('writes a selectData call to its path, where every bound component follows it', async () => {
    const { surface, toServer } = renderSurface(selectDataButton({}));
    const view = await chartView();

    fireEvent.click(screen.getByRole('button', { name: 'Select run a' }));

    expect(surface.dataModel.get('/selection/runs')).toEqual({
      field: 'id',
      values: ['a'],
      source: 'selectData',
    });
    await waitFor(() => expect(view.signal('sel')).toMatchObject({ id: ['a'] }));
    expect(tableRow('a', 0)).toHaveAttribute('aria-selected', 'true');
    expect(tableRow('b', 0)).not.toHaveAttribute('aria-selected');
    expect(screen.getByRole('button', { name: /Run A/u })).toHaveAttribute('aria-pressed', 'true');
    expect(toServer).not.toHaveBeenCalled();
  }, 20_000);

  it('refuses a selectData call aimed at another surface and writes nothing', async () => {
    const { surface } = renderSurface(selectDataButton({ surfaceId: 'elsewhere' }));
    const onError = vi.fn();
    surface.onError.subscribe(onError);

    fireEvent.click(screen.getByRole('button', { name: 'Select run a' }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_FAILED' })),
    );
    expect(surface.dataModel.get('/selection/runs')).toBeUndefined();
  }, 20_000);
});

/** A button whose action calls `selectData` for run "a" on `/selection/runs`. */
function selectDataButton(args: Record<string, unknown>): ExtraComponents {
  const components = [
    {
      id: 'pick',
      component: 'Button',
      child: 'pick_label',
      action: {
        functionCall: {
          call: 'selectData',
          args: { path: '/selection/runs', field: 'id', rowIds: ['a'], ...args },
          returnType: 'void',
        },
      },
    },
    { id: 'pick_label', component: 'Text', text: 'Select run a' },
  ];
  return { rootChildren: ['pick'], components };
}
