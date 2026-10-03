import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';
import { resolvedCardAction, type CardActionDispatchContext } from './kernel-catalog-card-actions';

vi.mock('@/components/clio/scientific-map-view', () => ({
  ClioScientificMapView: () => <div data-testid="professional-map-renderer" />,
}));

// The map's side list virtualizes with `@tanstack/react-virtual` (#1533
// MEDIUM 6); jsdom never resolves a real scroll-container height, so — same
// as every other virtualized list in this codebase — stub it to render every
// row, keeping these tests about catalog wiring rather than virtualization.
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

vi.mock('@/components/clio/mermaid-diagram', () => ({
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

const TEST_CATALOG_ID = 'test://kernel-catalog';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [...KERNEL_COMPONENTS.values()],
  [...KERNEL_FUNCTIONS.values()],
);

const TEST_SURFACE_ID = 'scientific-view';

function buildSurface(components: Record<string, unknown>[], extraMessages: A2uiMessage[] = []) {
  const surfaceId = TEST_SURFACE_ID;
  const processor = new MessageProcessor([testCatalog], async () => undefined, {
    version: 'v0.9.1',
  });
  processor.processMessages([
    {
      version: 'v0.9.1',
      createSurface: { surfaceId, catalogId: TEST_CATALOG_ID },
    },
    ...extraMessages,
    {
      version: 'v0.9.1',
      updateComponents: { surfaceId, components },
    },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the test surface to exist');
  return surface;
}

describe('CLIO A2UI kernel catalog', () => {
  it('renders a titled Frame as plain typography without a nested panel', () => {
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['frame'] },
      {
        id: 'frame',
        component: 'Frame',
        child: 'body',
        title: 'Daily station changes',
        description: 'Three stations reported movement',
        accessibility: { label: 'Station summary' },
      },
      { id: 'body', component: 'Text', text: 'North moved 2 mm' },
    ]);

    const { container } = render(<A2uiSurface surface={surface} />);

    const frame = screen.getByRole('group', { name: 'Station summary' });
    expect(within(frame).getByText('Daily station changes')).toBeVisible();
    expect(within(frame).getByText('Three stations reported movement')).toBeVisible();
    expect(within(frame).getByText('North moved 2 mm')).toBeVisible();
    expect(frame.querySelector('[data-slot="frame-panel"]')).toBeNull();
    expect(container.querySelector('[data-slot="a2ui-surface-card"]')).toBeNull();
  });

  it('renders the shared data-grid component instead of a JSON representation', async () => {
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['table'] },
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

    render(<A2uiSurface surface={surface} />);

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: /^displacement mm/u })).toBeVisible();
    expect(within(table).getByRole('cell', { name: 'accepted' })).toBeVisible();
    expect(screen.getByLabelText('Accessible displacement table columns')).toHaveAttribute(
      'aria-description',
      'Observed displacement and quality',
    );
  });

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
    const user = userEvent.setup();
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
    expect(container.querySelector('[data-slot="frame-panel"]')).toBeNull();
    expect(screen.getByLabelText('Accessible station map')).toHaveAttribute(
      'aria-description',
      'Two bounded EarthScope locations',
    );
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('menuitem', { name: '2 locations' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Show locations list' }));
    await user.keyboard('{Escape}');
    expect(screen.getByTitle('Total map locations')).toHaveTextContent('2 locations');
    const second = screen.getByRole('button', { name: /Station 2/ });
    fireEvent.click(second);
    expect(screen.getByRole('button', { name: /Station 2/ })).toHaveAttribute('aria-pressed', 'true');
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

  it('dispatches action-card and approval button actions instead of dropping them (#1549 G1)', async () => {
    // The generic binder already resolves `item.action` into a zero-arg
    // closure (`GenericBinder.bindAction`) before these components ever see
    // it, so re-wrapping it in `context.dispatchAction(...)` hands
    // `SurfaceModel.dispatchAction` a function instead of an `{ event }`
    // payload, which it drops with no `event` key and no error. Calling the
    // closure directly is the same path `Button`'s own `onClick: props.action`
    // and this file's `Callout` already use.
    //
    // The closure's dispatch runs through `ComponentContext._actionDispatcher`
    // (`surface.dispatchAction(action, this.componentModel.id)`), so the
    // emitted event also carries `sourceComponentId` -- the id of the
    // action-card/approval component itself, not the button -- and the
    // binder resolves any `{ path }` context value against the live data
    // model before dispatch. Both are asserted here, not only `name`.
    const continueAction = {
      event: { name: 'card.continue', context: { reportId: { path: '/report/id' } } },
    };
    const approveAction = { event: { name: 'approval.approve' } };
    const surface = buildSurface(
      [
        { id: 'root', component: 'Column', children: ['action', 'approval'] },
        {
          id: 'action',
          component: 'clio.action-card.v1',
          title: 'Continue analysis',
          body: 'Review the result',
          severity: 'info',
          actions: [{ label: 'Continue', action: continueAction }],
        },
        {
          id: 'approval',
          component: 'clio.approval.v1',
          title: 'Approve export',
          reason: 'Write the report',
          risk: 'low',
          actions: [{ label: 'Approve', action: approveAction }],
        },
      ],
      [
        {
          version: 'v0.9.1',
          updateDataModel: { surfaceId: TEST_SURFACE_ID, path: '/report/id', value: 'RPT-42' },
        },
      ] as A2uiMessage[],
    );
    const onAction = vi.fn();
    surface.onAction.subscribe(onAction);

    render(<A2uiSurface surface={surface} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await vi.waitFor(() => {
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'card.continue',
          sourceComponentId: 'action',
          context: { reportId: 'RPT-42' },
        }),
      );
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'approval.approve', sourceComponentId: 'approval' }),
      );
    });
  });

  describe('resolvedCardAction guards a non-function action (adversarial review #514 finding 5)', () => {
    // The binder contract `resolvedCardAction`'s own doc comment describes
    // (`CommonSchemas.Action` always classifies as `ACTION` and gets
    // wrapped) means a real `MessageProcessor` render can't produce a
    // non-function `item.action` without first failing schema validation --
    // there is no live reproduction that doesn't also break the surface a
    // different way. This calls the guard directly, the same way the
    // action-card/approval click handlers do, to prove the defensive branch
    // itself: it must never call a non-function, and it must report through
    // `dispatchError` rather than silently doing nothing.
    function fakeContext(): CardActionDispatchContext & {
      dispatchError: ReturnType<typeof vi.fn>;
    } {
      const dispatchError = vi.fn().mockResolvedValue(undefined);
      return { dataContext: { surface: { dispatchError } }, dispatchError };
    }

    it('calls a resolved function action directly, with no dispatchError', () => {
      const context = fakeContext();
      const action = vi.fn();
      const boundAction = action as unknown as Parameters<typeof resolvedCardAction>[0];

      resolvedCardAction(boundAction, context)();

      expect(action).toHaveBeenCalledTimes(1);
      expect(context.dispatchError).not.toHaveBeenCalled();
    });

    it('reports a local, unposted resolution problem instead of calling a non-function action', () => {
      const context = fakeContext();
      const unresolvedAction = { event: { name: 'card.continue' } } as unknown as Parameters<
        typeof resolvedCardAction
      >[0];

      expect(() => resolvedCardAction(unresolvedAction, context)()).not.toThrow();

      expect(context.dispatchError).toHaveBeenCalledTimes(1);
      const [reported] = context.dispatchError.mock.calls[0] as [{ code: string; message: string }];
      // A real `VALIDATION_FAILED` belongs on the wire (owner decision 11);
      // this is a local resolution problem, so it must use a different code
      // -- that's what routes it to the visible, unposted `localNotice` card
      // in `a2ui-surface.tsx`'s `handleValidationFailed` instead of a POST.
      expect(reported.code).not.toBe('VALIDATION_FAILED');
      expect(reported.message.length).toBeGreaterThan(0);
    });
  });

  it('shows a clean fallback card, not the raw red "Unknown component" error, for a retired clio.time-series.v1', () => {
    // #1533 MEDIUM 7: `clio.time-series.v1` was retired in favor of the
    // preset-based `clio.chart.v1`, but old transcripts still name it. A
    // legacy payload's shape is whatever the deleted schema once allowed —
    // an arbitrary `points`/`series` blob here stands in for "anything at
    // all", since the fallback reads none of it.
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['legacy-chart'] },
      {
        id: 'legacy-chart',
        component: 'clio.time-series.v1',
        title: 'Displacement over time',
        series: [{ label: 'GNSS01', points: [{ x: 1, y: 2 }] }],
      },
    ]);

    render(<A2uiSurface surface={surface} />);

    expect(screen.getByText('This chart type is no longer supported')).toBeVisible();
    expect(screen.getByText(/ask the agent to redraw it/iu)).toBeVisible();
    expect(screen.queryByText(/Unknown component type/iu)).not.toBeInTheDocument();
  });

  describe('G0: clio.metric.v1 built-in affordances', () => {
    it('copies the value (with its unit) to the clipboard, never the bare toolbar', async () => {
      const user = userEvent.setup();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

      const surface = buildSurface([
        { id: 'root', component: 'Column', children: ['metric'] },
        {
          id: 'metric',
          component: 'clio.metric.v1',
          label: 'Stations',
          value: 72,
          unit: 'sites',
        },
      ]);
      render(<A2uiSurface surface={surface} />);

      await user.click(screen.getByRole('button', { name: 'More' }));
      await user.click(screen.getByRole('menuitem', { name: 'Copy' }));

      expect(writeText).toHaveBeenCalledWith('72 sites');
      Reflect.deleteProperty(navigator, 'clipboard');
    });
  });

  describe('"exactly one of X or dataUri" exclusivity checks (#1533 LOW)', () => {
    // `Boolean('')` reads the same as `Boolean(undefined)` — an inline field
    // provided as an explicit empty string must still count as "provided",
    // or an old surface sending one deliberately fails validation outright.
    it.each([
      ['clio.code.v1', { code: '', language: 'python' }],
      ['clio.diff.v1', { path: 'a/b.py', diff: '' }],
      ['clio.mermaid.v1', { source: '' }],
    ] as const)('accepts an empty-string inline value for %s', (name, props) => {
      const schema = KERNEL_COMPONENTS.get(name)!.schema;
      expect(schema.safeParse(props).success).toBe(true);
    });

    it.each([
      ['clio.code.v1', { language: 'python' }],
      ['clio.diff.v1', { path: 'a/b.py' }],
      ['clio.mermaid.v1', {}],
    ] as const)(
      'still rejects %s when neither the inline value nor dataUri is given',
      (name, props) => {
        const schema = KERNEL_COMPONENTS.get(name)!.schema;
        expect(schema.safeParse(props).success).toBe(false);
      },
    );

    it.each([
      ['clio.code.v1', { code: 'x', dataUri: 'artifact://artifact_1', language: 'python' }],
      ['clio.diff.v1', { path: 'a/b.py', diff: 'x', dataUri: 'artifact://artifact_1' }],
      ['clio.mermaid.v1', { source: 'x', dataUri: 'artifact://artifact_1' }],
    ] as const)(
      'still rejects %s when both the inline value and dataUri are given',
      (name, props) => {
        const schema = KERNEL_COMPONENTS.get(name)!.schema;
        expect(schema.safeParse(props).success).toBe(false);
      },
    );
  });
});
