import { TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no 2D canvas: the chart falls back to Vega's SVG renderer, and
// Vega (which probes a canvas for text metrics at import) estimates quietly.
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
// The real vega-embed, with each embedded view kept for the test to inspect.
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

import { ClioChart, type ClioChartProps } from './a2ui-chart';
import { escapeHtml, formatChartTooltip, refusingLoader } from './chart-embed';

const ROWS = [
  { t: 0, v: 1.5, run: 'a' },
  { t: 1, v: 1.2, run: 'a' },
  { t: 0, v: 2.0, run: 'b' },
  { t: 1, v: 2.4, run: 'b' },
];

const PRESET: Pick<ClioChartProps, 'preset' | 'xField' | 'yField' | 'entityField'> = {
  preset: 'trajectories',
  xField: 't',
  yField: 'v',
  entityField: 'run',
};

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function embeddedView(): Promise<View> {
  await waitFor(() => expect(embedded.views.length).toBeGreaterThan(0));
  return embedded.views.at(-1)!;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  embedded.views = [];
});

describe('ClioChart', () => {
  it('draws a preset over inline rows as the named dataset "source"', async () => {
    const { container } = render(
      wrap(<ClioChart {...PRESET} componentId="ch1" data={ROWS} title="Loss" />),
    );

    const view = await embeddedView();
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
    expect(view.data('source')).toHaveLength(4);
    expect(screen.getByText('Loss')).toBeInTheDocument();
    expect(screen.getByText(/v over t, one line per run\. · 4 rows/u)).toBeInTheDocument();
    expect(container.querySelector('[data-renderer="svg"]')).not.toBeNull();
  });

  it('refuses a spec that breaks the guard and says why, without embedding it', () => {
    render(
      wrap(
        <ClioChart
          componentId="ch5"
          data={ROWS}
          spec={{ data: { url: 'https://example.test/x.csv' }, mark: 'point' }}
        />,
      ),
    );
    expect(
      screen.getByText(/Chart unavailable: the spec breaks the chart rules/u),
    ).toHaveTextContent("'url' is not allowed anywhere (at /data/url)");
    expect(embedded.views).toHaveLength(0);
  });

  it('says which preset field is missing', () => {
    render(
      wrap(
        <ClioChart
          componentId="ch14"
          data={ROWS}
          preset="heatmap"
          xField="t"
          yField="v"
          entityField="run"
        />,
      ),
    );
    expect(screen.getByText(/requires field\(s\) colorField/u)).toBeInTheDocument();
  });

  const DATA_QUERY_FILTER = [
    { column: 'run', op: 'in', value: ['a'] },
    { column: 't', op: 'range', value: [0, null] },
  ] as const;
  const DATA_QUERY_DOWNSAMPLE = {
    mode: 'per_entity_lttb',
    entityColumn: 'run',
    x: 't',
    y: 'v',
    maxPerEntity: 500,
  } as const;

  it('sends the dataQuery to the table-query endpoint as written and notes a downsample', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { t: [0, 1], v: [1, 2], run: ['a', 'a'] },
      totalRows: 90_000,
      matchedRows: 90_000,
      returnedRows: 2,
      truncated: false,
      downsample: { mode: 'per_entity_lttb' },
    });
    render(
      wrap(
        <ClioChart
          {...PRESET}
          componentId="ch2"
          dataQuery={{
            filter: DATA_QUERY_FILTER,
            downsample: DATA_QUERY_DOWNSAMPLE,
            limit: 900_000,
          }}
          dataUri="artifact://artifact_runs01"
        />,
      ),
    );

    const view = await embeddedView();
    expect(repository.artifactTableQuery).toHaveBeenCalledWith(
      'artifact_runs01',
      {
        // Only the projection (from the preset) and the row budget are filled in.
        columns: ['t', 'v', 'run'],
        filter: DATA_QUERY_FILTER,
        downsample: DATA_QUERY_DOWNSAMPLE,
        // The producer's limit is clamped to TABLE_QUERY_ROW_LIMIT.
        limit: 50_000,
      },
      expect.anything(),
    );
    await waitFor(() =>
      expect(view.data('source')).toEqual([
        expect.objectContaining({ t: 0, v: 1, run: 'a' }),
        expect.objectContaining({ t: 1, v: 2, run: 'a' }),
      ]),
    );
    expect(
      screen.getByText('Showing 2 of 90,000 rows, downsampled (per entity lttb).'),
    ).toBeInTheDocument();
  });

  it('states a table-query refusal in words', async () => {
    repository.artifactTableQuery.mockRejectedValue(
      new TransportError('one or more requested columns do not exist', 400, 'columns_not_found', {
        missing: ['v'],
      }),
    );
    render(wrap(<ClioChart {...PRESET} componentId="ch2" dataUri="artifact://artifact_runs01" />));
    expect(
      await screen.findByText('Chart unavailable: the table has no column “v”.'),
    ).toBeInTheDocument();
  });

  it('writes a selection made in the chart, with itself as the source', async () => {
    const setSelection = vi.fn();
    render(
      wrap(<ClioChart {...PRESET} componentId="ch1" data={ROWS} setSelection={setSelection} />),
    );
    const view = await embeddedView();
    await waitFor(() => expect(() => view.signal('sel_tuple_fields')).not.toThrow());

    // What a click on run "b" does inside Vega-Lite.
    view.signal('sel_tuple', { unit: '', fields: view.signal('sel_tuple_fields'), values: ['b'] });
    await view.runAsync();

    await waitFor(() =>
      expect(setSelection).toHaveBeenCalledWith({ field: 'run', values: ['b'], source: 'ch1' }),
    );
  });

  it('shows a selection another component wrote, and does not write it back', async () => {
    const setSelection = vi.fn();
    const props = { ...PRESET, componentId: 'ch1', data: ROWS, setSelection };
    const { rerender } = render(wrap(<ClioChart {...props} />));
    const view = await embeddedView();
    await waitFor(() => expect(() => view.signal('sel_tuple_fields')).not.toThrow());

    rerender(
      wrap(<ClioChart {...props} selection={{ field: 'run', values: ['a'], source: 'table' }} />),
    );

    await waitFor(() => expect(view.signal('sel')).toMatchObject({ run: ['a'] }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(setSelection).not.toHaveBeenCalled();

    // Its own echo is not re-applied: the chart's store keeps the external state.
    rerender(
      wrap(<ClioChart {...props} selection={{ field: 'run', values: ['b'], source: 'ch1' }} />),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(view.signal('sel')).toMatchObject({ run: ['a'] });
  });

  it('says when a bound selection has no selection param to follow', async () => {
    render(
      wrap(
        <ClioChart
          componentId="ch3"
          data={ROWS}
          selection={{ field: 'run', values: ['a'] }}
          spec={{ mark: 'point', encoding: { x: { field: 't', type: 'quantitative' } } }}
        />,
      ),
    );
    expect(await screen.findByText(/has no “sel” selection/u)).toBeInTheDocument();
  });
});

describe('chart embedding restrictions', () => {
  it('refuses every load, link, and file', async () => {
    const loader = refusingLoader();
    await expect(loader.load('https://example.test/x.csv')).rejects.toThrow(/cannot load/u);
    await expect(
      loader.sanitize('https://example.test/x.png', { context: 'href' }),
    ).rejects.toThrow(/cannot load/u);
    await expect(loader.http('https://example.test/x.csv', {})).rejects.toThrow(/cannot load/u);
    await expect(loader.file('/etc/passwd')).rejects.toThrow(/cannot load/u);
  });

  it('keeps tooltips to escaped text and drops images', () => {
    const html = formatChartTooltip({
      title: '<b>run</b>',
      image: 'https://example.test/tracker.png',
      '<i>key</i>': '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('tracker.png');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('<h2>&lt;b&gt;run&lt;/b&gt;</h2>');
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });

  it('makes no network request of its own for inline rows', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(wrap(<ClioChart {...PRESET} componentId="ch1" data={ROWS} />));
    await embeddedView();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
