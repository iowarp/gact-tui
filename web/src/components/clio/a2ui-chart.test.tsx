import { TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no 2D canvas: the chart falls back to Vega's SVG renderer, and
// Vega (which probes a canvas for text metrics at import) estimates quietly.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

import type { View } from 'vega';
import type { Result } from 'vega-embed';

const repository = vi.hoisted(() => ({ artifactTableExport: vi.fn(), artifactTableQuery: vi.fn() }));
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

import { useState } from 'react';
import guardCases from '@/test-fixtures/chart/guard_cases.json';
import { ClioChart, type ClioChartProps } from './a2ui-chart';
import { CHART_SELECTION_WRITE_DEBOUNCE_MS } from './chart-selection';
import type { ChartRow } from './chart-data';
import { ClioComposerAnnotations } from './composer-annotations';
import { escapeHtml, formatChartTooltip, refusingLoader } from './chart-embed';
import { SelectionActionsProvider } from './selection-actions';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import type { ComposerAnnotation } from '@/lib/composer-annotations';

function ComposerHarness({ children }: { children: ReactNode }) {
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

  it('draws the geoshape gallery fixture through the real embed path, no NaN coordinates (#1549 G4 review)', async () => {
    const testCase = guardCases.cases.find(
      (candidate) => candidate.name === 'gallery-choropleth-projection-geojson',
    )!;
    render(
      wrap(
        <ClioChart
          componentId="ch-geo"
          data={(testCase as { data: ChartRow[] }).data}
          spec={testCase.spec as Record<string, unknown>}
        />,
      ),
    );
    const view = await embeddedView();
    const svg = await view.toSVG();
    const geoshapeTags = [...svg.matchAll(/<path\b[^>]*"geoshape"[^>]*\/?>/gu)].map(([tag]) => tag);
    expect(geoshapeTags).toHaveLength((testCase as { data: unknown[] }).data.length);
    for (const tag of geoshapeTags) expect(tag).not.toMatch(/NaN/);
  });

  it('draws the lon/lat gallery fixture through the real embed path, no NaN coordinates (#1549 G4 review)', async () => {
    const testCase = guardCases.cases.find(
      (candidate) => candidate.name === 'gallery-lon-lat-point-map',
    )!;
    render(
      wrap(
        <ClioChart
          componentId="ch-lonlat"
          data={(testCase as { data: ChartRow[] }).data}
          spec={testCase.spec as Record<string, unknown>}
        />,
      ),
    );
    const view = await embeddedView();
    const svg = await view.toSVG();
    const circleTags = [...svg.matchAll(/<path\b[^>]*\/?>/gu)]
      .map(([tag]) => tag)
      .filter((tag) => tag.includes('"circle"') && tag.includes('aria-label'));
    expect(circleTags).toHaveLength((testCase as { data: unknown[] }).data.length);
    for (const tag of circleTags) expect(tag).not.toMatch(/NaN/);
  });

  it('does not lose a rows update that arrives while the chart is still embedding (#1533 #506 LOW)', async () => {
    // `embedChart` is genuinely async here (real vega-embed, just observed —
    // see the mock above); a `rows` prop change landing in the gap between
    // starting it and its promise resolving used to be silently dropped,
    // since the `[rows]` effect only pushes into an ALREADY-embedded view.
    // `rerender` runs synchronously, before that promise's `.then` gets a
    // chance to run — reliably landing in that exact gap.
    const { rerender } = render(
      wrap(<ClioChart {...PRESET} componentId="ch1" data={ROWS} title="Loss" />),
    );
    const laterRows = [...ROWS, { t: 2, v: 3.1, run: 'a' }];
    rerender(wrap(<ClioChart {...PRESET} componentId="ch1" data={laterRows} title="Loss" />));

    const view = await embeddedView();
    await waitFor(() => expect(view.data('source')).toHaveLength(laterRows.length));
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

  it('includes the producer\'s own downsample request in the "current view" CSV export, matching what the chart actually plots (#516 review item 16)', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { t: [0, 1], v: [1, 2], run: ['a', 'a'] },
      totalRows: 90_000,
      matchedRows: 90_000,
      returnedRows: 2,
      truncated: false,
      downsample: { mode: 'per_entity_lttb' },
    });
    repository.artifactTableExport.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const user = userEvent.setup();
    render(
      wrap(
        <ClioChart
          {...PRESET}
          componentId="ch2b"
          dataQuery={{ downsample: DATA_QUERY_DOWNSAMPLE }}
          dataUri="artifact://artifact_runs01"
        />,
      ),
    );
    await embeddedView();

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: /Download/ }));
    const csvItem = await screen.findByRole('menuitem', { name: 'CSV (current view)' });
    fireEvent.pointerMove(csvItem);
    fireEvent.click(csvItem);

    await waitFor(() =>
      expect(repository.artifactTableExport).toHaveBeenCalledWith(
        'artifact_runs01',
        expect.objectContaining({
          downsample: DATA_QUERY_DOWNSAMPLE,
          format: 'csv',
          scope: 'current',
        }),
      ),
    );
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

  it('selects a value via the keyboard-operable control, writing it as a real click would (#1533 #506 LOW)', async () => {
    // A brush/lasso drag has no keyboard equivalent, but a point selection
    // does: a reui <Select> beside the chart lists the entity field's own
    // distinct values, keyboard-navigable by construction (Radix Select).
    const user = userEvent.setup();
    const setSelection = vi.fn();
    render(
      wrap(<ClioChart {...PRESET} componentId="ch1" data={ROWS} setSelection={setSelection} />),
    );
    await embeddedView();

    const trigger = await screen.findByRole('combobox', { name: 'Select a run by keyboard' });
    await user.click(trigger);
    const option = await screen.findByRole('option', { name: 'b' });

    // The chart -> data-model write is debounced by production design
    // (CHART_SELECTION_WRITE_DEBOUNCE_MS, chart-selection.ts), through a real
    // `setTimeout` the selection's signal listener schedules once `view.data`
    // + `runAsync()` (triggered by the click below) resolve. Waiting that out
    // via `waitFor`'s own retry budget made this assertion's pass/fail depend
    // on real wall-clock scheduling keeping up under a loaded test runner,
    // not on the debounce's own logic (already covered by
    // chart-selection.test.ts) -- the actual cause of this test's flakiness
    // under parallel load. Faking timers only for the click that triggers the
    // debounce, then advancing past it deterministically, removes that
    // dependency regardless of runner load; real timers are restored
    // immediately after for every other test (the earlier, real-timer-driven
    // popover open above is unaffected either way).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await user.click(option);
      await vi.advanceTimersByTimeAsync(CHART_SELECTION_WRITE_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }

    expect(setSelection).toHaveBeenCalledWith({ field: 'run', values: ['b'], source: 'ch1' });
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

  it('re-queries the brushed x range at full detail and offers a reset control', async () => {
    repository.artifactTableQuery.mockImplementation((_id: string, request: { filter?: Array<{ column: string; op: string }> }) => {
      const zoomed = (request.filter ?? []).some((entry) => entry.column === 't' && entry.op === 'range');
      return Promise.resolve(
        zoomed
          ? {
              columns: { run: ['a'], t: [0.4], v: [1.8] },
              downsample: { mode: 'none' },
              matchedRows: 1,
              returnedRows: 1,
              schema: [],
              totalRows: 4,
              truncated: false,
            }
          : {
              columns: { run: ['a', 'a', 'b', 'b'], t: [0, 1, 0, 1], v: [1.5, 1.2, 2, 2.4] },
              downsample: { mode: 'none' },
              matchedRows: 4,
              returnedRows: 4,
              schema: [],
              totalRows: 4,
              truncated: false,
            },
      );
    });
    render(wrap(<ClioChart {...PRESET} componentId="ch9" dataUri="artifact://artifact_runs01" />));
    const view = await embeddedView();
    await waitFor(() => expect(() => view.signal('sel_zoom')).not.toThrow());

    // What a real drag over the x axis produces: the pixel-space `<param>_x`
    // signal, which vega-lite inverts through the x scale (chart-zoom.test.ts
    // pins the exact resolved shape against the installed vega-lite).
    view.signal('sel_zoom_x', [0, view.width()]);
    await view.runAsync();

    await waitFor(
      () =>
        expect(repository.artifactTableQuery).toHaveBeenCalledWith(
          'artifact_runs01',
          expect.objectContaining({
            filter: expect.arrayContaining([expect.objectContaining({ column: 't', op: 'range' })]),
          }),
          expect.anything(),
        ),
      { timeout: 2000 },
    );

    expect(await screen.findByText(/^Zoomed to t/u)).toBeInTheDocument();
    const resetButton = screen.getByRole('button', { name: /reset zoom/iu });
    // `fireEvent` (not a bare DOM `.click()`) wraps the resulting state
    // update in `act(...)` itself (#516 review item 16's act() warning).
    fireEvent.click(resetButton);
    await waitFor(() => expect(screen.queryByText(/^Zoomed to t/u)).not.toBeInTheDocument());
  });

  it("layers the viewer's own filter onto the producer's dataQuery, never replacing it", async () => {
    repository.artifactTableQuery.mockResolvedValue({
      columns: { run: ['b'], t: [0], v: [2] },
      downsample: { mode: 'none' },
      matchedRows: 1,
      returnedRows: 1,
      schema: [],
      totalRows: 4,
      truncated: false,
    });
    const user = userEvent.setup();
    render(
      wrap(
        <ClioChart
          {...PRESET}
          componentId="ch10"
          dataQuery={{ filter: [{ column: 'run', op: 'eq', value: 'a' }] }}
          dataUri="artifact://artifact_runs01"
        />,
      ),
    );
    await embeddedView();
    await waitFor(() => expect(repository.artifactTableQuery).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /^filters/iu }));
    await user.type(screen.getByLabelText('Filter run, contains'), 'b');

    await waitFor(
      () =>
        expect(repository.artifactTableQuery).toHaveBeenLastCalledWith(
          'artifact_runs01',
          expect.objectContaining({
            filter: [
              { column: 'run', op: 'eq', value: 'a' },
              { column: 'run', op: 'contains', value: 'b' },
            ],
          }),
          expect.anything(),
        ),
      { timeout: 2000 },
    );
  });

  it('"Reference this" attaches the dataset, filters, and the brushed zone, with a re-queryable JSON block', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      columns: { run: ['a', 'a'], t: [0, 1], v: [1.5, 1.2] },
      downsample: { mode: 'none' },
      matchedRows: 4,
      returnedRows: 2,
      schema: [],
      totalRows: 4,
      truncated: false,
    });
    const user = userEvent.setup();
    render(
      wrap(
        <SelectionActionsProvider>
          <ComposerHarness>
            <ClioChart
              {...PRESET}
              componentId="ch11"
              dataQuery={{ filter: [{ column: 'run', op: 'eq', value: 'a' }] }}
              dataUri="artifact://artifact_runs01"
              title="Loss over time"
            />
          </ComposerHarness>
        </SelectionActionsProvider>,
      ),
    );
    await embeddedView();
    await waitFor(() => expect(repository.artifactTableQuery).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Reference this' }));

    // The card: a plain label and one-line summary only (#1533 coordinator
    // review) — the dataset id and filter live in the full reference,
    // reached via the expand control and sent with the message.
    const attached = screen.getByRole('list', { name: 'Attached selections' });
    expect(attached).toHaveTextContent('Loss over time');
    expect(attached).toHaveTextContent('the whole view (4 rows)');
    expect(attached.textContent).not.toContain('artifact_runs01');

    await user.click(screen.getByRole('button', { name: /Show the full .* reference/u }));
    const popover = await screen.findByText('Sent with your next message, exactly as shown below.');
    const popoverBody = popover.closest('[data-slot="popover-content"]') as HTMLElement;
    expect(popoverBody).toHaveTextContent('artifact_runs01');
    expect(popoverBody).toHaveTextContent('run = a');
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
