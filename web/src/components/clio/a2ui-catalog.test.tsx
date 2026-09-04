import { MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A2uiSurface, CLIO_A2UI_CATALOG_ID, clioA2UICatalog } from './a2ui-catalog';

vi.mock('./scientific-map-view', () => ({
  ClioScientificMapView: () => <div data-testid="professional-map-renderer" />,
}));

vi.mock('./mermaid-diagram', () => ({
  ClioMermaidDiagram: ({
    accessibilityDescription,
    accessibilityLabel,
  }: {
    accessibilityDescription?: string;
    accessibilityLabel?: string;
  }) => <section aria-description={accessibilityDescription} aria-label={accessibilityLabel} />,
}));

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 260,
    height: 260,
    left: 0,
    right: 720,
    top: 0,
    width: 720,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function buildSurface(components: Record<string, unknown>[]) {
  const surfaceId = 'scientific-view';
  const processor = new MessageProcessor([clioA2UICatalog], async () => undefined, {
    version: 'v0.9.1',
  });
  processor.processMessages([
    {
      version: 'v0.9.1',
      createSurface: { surfaceId, catalogId: CLIO_A2UI_CATALOG_ID },
    },
    {
      version: 'v0.9.1',
      updateComponents: { surfaceId, components },
    },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the test surface to exist');
  return surface;
}

describe('CLIO A2UI scientific catalog', () => {
  // The plot is code-split, so both this test and the accessibility sweep below
  // wait on a real dynamic import resolving through Suspense before they can
  // assert anything. The default per-test budget is not enough for that on a
  // loaded machine, and eagerly pulling the charting library in to make the
  // tests faster would cost every user the download instead.
  it('renders shared chart and data-grid components instead of JSON representations', async () => {
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['plot', 'table'] },
      {
        id: 'plot',
        component: 'clio.time-series.v1',
        accessibility: {
          label: 'Accessible displacement chart',
          description: 'Three observed displacement samples',
        },
        title: 'Vertical displacement',
        xKey: 'day',
        yKeys: ['displacement_mm'],
        series: [
          { day: 1, displacement_mm: 0.2 },
          { day: 2, displacement_mm: 0.5 },
          { day: 3, displacement_mm: 0.4 },
        ],
      },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        accessibility: {
          label: 'Accessible displacement table',
          description: 'Observed displacement and quality',
        },
        columns: ['day', 'displacement_mm', 'quality'],
        rows: [{ day: 1, displacement_mm: 0.2, quality: 'accepted' }],
      },
    ]);

    const { container } = render(<A2uiSurface surface={surface} />);

    expect(
      await screen.findByRole('img', { name: /Vertical displacement plot/u }, { timeout: 5_000 }),
    ).toBeVisible();
    expect(screen.getByText('3 rows')).toBeVisible();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: /^displacement mm/u })).toBeVisible();
    expect(within(table).getByRole('cell', { name: 'accepted' })).toBeVisible();
    expect(container.querySelector('[data-slot="chart"]')).toBeInTheDocument();
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
    expect(screen.getByLabelText('Accessible displacement chart')).toHaveAttribute(
      'aria-description',
      'Three observed displacement samples',
    );
    expect(screen.getByLabelText('Accessible displacement table columns')).toHaveAttribute(
      'aria-description',
      'Observed displacement and quality',
    );
    expect(container.textContent).not.toContain('"series"');
  }, 20_000);

  it('accepts labeled table-column objects for scientific units', async () => {
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['table'] },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        columns: [{ key: 'displacement_mm', label: 'Displacement (mm)' }],
        rows: [{ displacement_mm: 1.2 }],
      },
    ]);

    render(<A2uiSurface surface={surface} />);

    expect(
      await screen.findByRole('columnheader', { name: /^Displacement \(mm\)/u }),
    ).toBeVisible();
    expect(screen.getByRole('cell', { name: '1.2' })).toBeVisible();
  });

  it('keeps operational state labeled and indeterminate progress honest', () => {
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['status', 'progress'] },
      {
        id: 'status',
        component: 'clio.status.v1',
        label: 'Quality gate',
        state: 'failed',
      },
      {
        id: 'progress',
        component: 'clio.progress.v1',
        label: 'Collect evidence',
        state: 'running',
        detail: '4 of 6 sources checked',
      },
    ]);

    render(<A2uiSurface surface={surface} />);

    expect(screen.getByText('Quality gate')).toBeVisible();
    expect(screen.getByText('failed')).toBeVisible();
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Collect evidence indeterminate')).toBeVisible();
    expect(screen.getByText('4 of 6 sources checked')).toBeVisible();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('renders bounded interactive map locations without exposing map configuration', async () => {
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['map'] },
      {
        id: 'map',
        component: 'clio.map.v1',
        accessibility: {
          label: 'Accessible station map',
          description: 'Two bounded EarthScope locations',
        },
        title: 'EarthScope stations',
        points: [
          {
            id: 'station_1',
            label: 'Station 1',
            latitude: 41.88,
            longitude: -87.63,
            category: 'GNSS',
            detail: 'Illustrative station',
          },
          {
            id: 'station_2',
            label: 'Station 2',
            latitude: 40.12,
            longitude: -88.21,
            category: 'Seismic',
          },
        ],
      },
    ]);

    const { container } = render(<A2uiSurface surface={surface} />);

    expect(await screen.findByTestId('professional-map-renderer')).toBeInTheDocument();
    expect(screen.getByLabelText('Accessible station map')).toHaveAttribute(
      'aria-description',
      'Two bounded EarthScope locations',
    );
    expect(screen.getByText('2 labeled locations')).toBeVisible();
    const second = screen.getByRole('button', { name: /Station 2/ });
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('40.12000, -88.21000')).toBeVisible();
    expect(container.textContent).not.toContain('tile.openstreetmap.org');
  });

  it('consumes accessibility metadata across the custom catalog renderers', async () => {
    const action = { event: { name: 'approval.respond' } };
    const surface = buildSurface([
      {
        id: 'root',
        component: 'Grid',
        children: [
          'frame',
          'metric',
          'progress',
          'callout',
          'table',
          'diagram',
          'workflow',
          'code',
          'diff',
          'action',
          'approval',
        ],
        accessibility: { label: 'Catalog grid', description: 'Accessible renderer collection' },
      },
      {
        id: 'frame',
        component: 'Frame',
        child: 'status',
        title: 'Run state',
        accessibility: { label: 'State frame', description: 'Current run state' },
      },
      {
        id: 'status',
        component: 'clio.status.v1',
        label: 'Analysis',
        state: 'running',
        accessibility: { label: 'Analysis status', description: 'Analysis is active' },
      },
      {
        id: 'metric',
        component: 'clio.metric.v1',
        label: 'Stations',
        value: 72,
        accessibility: { label: 'Station metric', description: 'Observed station count' },
      },
      {
        id: 'progress',
        component: 'clio.progress.v1',
        label: 'Collect evidence',
        state: 'running',
        accessibility: { label: 'Evidence progress', description: 'Collection is active' },
      },
      {
        id: 'callout',
        component: 'clio.callout.v1',
        title: 'Source limitation',
        body: 'Historical data',
        severity: 'warning',
        accessibility: { label: 'Source warning', description: 'Data is historical' },
      },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        columns: ['station'],
        rows: [{ station: 'MTA1' }],
        accessibility: { label: 'Station table', description: 'Ranked stations' },
      },
      {
        id: 'diagram',
        component: 'clio.mermaid.v1',
        source: 'flowchart LR\nA --> B',
        accessibility: { label: 'Analysis diagram', description: 'Analysis workflow' },
      },
      {
        id: 'workflow',
        component: 'clio.workflow.v1',
        nodes: [
          { id: 'a', label: 'Acquire' },
          { id: 'b', label: 'Analyze' },
        ],
        edges: [{ source: 'a', target: 'b' }],
        accessibility: { label: 'Workflow graph', description: 'Acquire then analyze' },
      },
      {
        id: 'code',
        component: 'clio.code.v1',
        code: 'print(72)',
        language: 'python',
        accessibility: { label: 'Analysis code', description: 'Python station count' },
      },
      {
        id: 'diff',
        component: 'clio.diff.v1',
        path: 'analysis.py',
        diff: '+print(72)',
        accessibility: { label: 'Analysis diff', description: 'Proposed analysis change' },
      },
      {
        id: 'action',
        component: 'clio.action-card.v1',
        title: 'Continue analysis',
        body: 'Review the result',
        severity: 'info',
        actions: [],
        accessibility: { label: 'Analysis action', description: 'Available next action' },
      },
      {
        id: 'approval',
        component: 'clio.approval.v1',
        title: 'Approve export',
        reason: 'Write the report',
        risk: 'low',
        actions: [{ label: 'Approve', action }],
        accessibility: { label: 'Export approval', description: 'Approval required' },
      },
    ]);

    render(<A2uiSurface surface={surface} />);

    for (const label of [
      'Catalog grid',
      'State frame',
      'Analysis status',
      'Station metric',
      'Evidence progress',
      'Source warning',
      'Station table columns',
      'Analysis diagram',
      'Workflow graph',
      'Analysis code',
      'Analysis diff',
      'Analysis action',
      'Export approval',
    ]) {
      expect((await screen.findAllByLabelText(label)).length).toBeGreaterThan(0);
    }
  }, 20_000);
});
