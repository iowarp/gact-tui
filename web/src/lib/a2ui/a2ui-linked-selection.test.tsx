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
const ROWS = [
  { t: 0, v: 1.5, run: 'a' },
  { t: 1, v: 1.2, run: 'a' },
  { t: 0, v: 2.0, run: 'b' },
  { t: 1, v: 2.4, run: 'b' },
];

function buildSurface() {
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
          { id: 'root', component: 'Column', children: ['chart', 'table', 'map'] },
          {
            id: 'chart',
            component: 'clio.chart.v1',
            preset: 'scatter',
            xField: 't',
            yField: 'v',
            entityField: 'run',
            data: ROWS,
            selection: { path: '/selection/runs' },
            title: 'Runs',
          },
          {
            id: 'table',
            component: 'clio.data-table.v1',
            columns: ['run', 't', 'v'],
            rows: ROWS,
            selection: { path: '/selection/runs' },
          },
          {
            id: 'map',
            component: 'clio.map.v1',
            points: [
              { id: 'a', label: 'Run A', latitude: 41.8, longitude: -87.6 },
              { id: 'b', label: 'Run B', latitude: 40.7, longitude: -74.0 },
            ],
            selection: { path: '/selection/runs' },
          },
        ],
      },
    },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the linked surface');
  return { surface, toServer };
}

function renderSurface() {
  const built = buildSurface();
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

function tableRow(run: string, t: number): HTMLElement {
  const table = screen.getByRole('table');
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => {
      const cells = within(candidate)
        .queryAllByRole('cell')
        .map((cell) => cell.textContent);
      return cells[0] === run && cells[1] === String(t);
    });
  if (!row) throw new Error(`No row for ${run} at ${t}`);
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
      field: 'run',
      values: ['b'],
      source: 'table',
    });
    await waitFor(() => expect(view.signal('sel')).toMatchObject({ run: ['b'] }));
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
        field: 'run',
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
    // The chart highlights rows whose `id` is "b" — this data has none, so none light up,
    // but the chart does not overwrite the map's selection either.
    await waitFor(() => expect(view.signal('sel')).toMatchObject({ id: ['b'] }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(surface.dataModel.get('/selection/runs')).toMatchObject({ source: 'map' });
  }, 20_000);

  it('follows a selection the producer writes into the data model', async () => {
    const { surface } = renderSurface();
    const view = await chartView();

    act(() => {
      surface.dataModel.set('/selection/runs', { field: 'run', values: ['a', 'b'] });
    });

    await waitFor(() => expect(view.signal('sel')).toMatchObject({ run: ['a', 'b'] }));
    expect(tableRow('a', 1)).toHaveAttribute('aria-selected', 'true');
    expect(tableRow('b', 1)).toHaveAttribute('aria-selected', 'true');
  }, 20_000);
});
