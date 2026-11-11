import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArtifactLineageView } from './artifact-lineage-view';

const repository = vi.hoisted(() => ({
  artifactDetail: vi.fn().mockResolvedValue({
    artifact: {
      workspace_id: 'ws_1',
      name: 'result.csv',
      kind: 'data',
      latest_version: 2,
      head_artifact_id: 'artifact_2',
      aliases: {},
      versions: [
        {
          artifact_id: 'artifact_1',
          workspace_id: 'ws_1',
          name: 'result.csv',
          version: 1,
          created_at: '2026-08-23T00:00:00Z',
          producer: { call_id: 'call_1' },
        },
        {
          artifact_id: 'artifact_2',
          workspace_id: 'ws_1',
          name: 'result.csv',
          version: 2,
          created_at: '2026-08-23T00:01:00Z',
          producer: { call_id: 'call_2', tool: 'soil_qc.py' },
        },
      ],
    },
    resolved: { artifact_id: 'artifact_2', version: 2 },
  }),
  artifactLineage: vi.fn().mockResolvedValue({
    root: 'artifact_2',
    direction: 'both',
    depth: 5,
    nodes: [
      { id: 'artifact_2', type: 'artifact', name: 'result.csv', version: 2, kind: 'data' },
      { id: 'activity:call_2', type: 'activity', tool: 'Build report', status: 'ok' },
    ],
    edges: [{ from: 'activity:call_2', to: 'artifact_2', type: 'generated' }],
  }),
  executionProvenance: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const artifact = {
  id: 'artifact_2',
  session_id: 'sess_1',
  name: 'result.csv',
  media_type: 'text/csv',
  uri: 'artifact://ws_1/result.csv@v2',
};

function mount(props: Partial<Parameters<typeof ArtifactLineageView>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ArtifactLineageView artifact={artifact} {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return client;
}

/** The graph is a lazy chunk; a cold import can outlast the default one-second find. */
const findNode = (name: RegExp) => screen.findByRole('button', { name }, { timeout: 10_000 });

it('shows a loading status while the lineage loads', async () => {
  repository.artifactLineage.mockReturnValueOnce(new Promise(() => undefined));
  mount();
  expect(await screen.findByRole('status', { name: 'Loading lineage' })).toBeInTheDocument();
});

it('draws the recorded lineage and opens the producing action in Activity', async () => {
  const onOpenActivity = vi.fn();
  const client = mount({ onOpenActivity });
  const action = await findNode(/Build report/u);
  // An action names itself in the node's sans title, as the spec draws it.
  expect(action.querySelector('b')).not.toHaveClass('font-mono');
  const canvas = screen.getByRole('region', { name: 'Artifact lineage graph' });
  expect(canvas).toBeVisible();
  // The graph is laid out from the canvas's top-left, not centred in it.
  expect(canvas).toHaveClass('items-start');
  expect(canvas.querySelector('[data-slot="lineage-layout"]')).not.toHaveClass('m-auto');
  expect(document.body).not.toHaveTextContent('"nodes"');
  expect(repository.executionProvenance).not.toHaveBeenCalled();
  expect(repository.artifactLineage).toHaveBeenCalledWith(
    'artifact_2',
    { direction: 'both', depth: 5 },
    expect.any(AbortSignal),
  );
  expect(
    client
      .getQueryCache()
      .findAll()
      .map((query) => query.queryKey),
  ).toContainEqual(['artifact-detail', 'http://127.0.0.1:8790', 'artifact_2']);
  await userEvent.click(action);
  expect(onOpenActivity).toHaveBeenCalledWith({
    callId: 'call_2',
    tool: 'Build report',
    sessionId: undefined,
  });
});

it('unfolds the earlier versions from the current file', async () => {
  const onOpenArtifact = vi.fn();
  mount({ onOpenArtifact });
  const self = await findNode(/result\.csv.*v2, 1 earlier/u);
  expect(self).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(self);
  expect(await screen.findByRole('region', { name: 'Versions of result.csv' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: /^v1/u }));
  expect(onOpenArtifact).toHaveBeenCalledWith(expect.objectContaining({ id: 'artifact_1' }));
});

it('keeps a service error behind a plain-language state', async () => {
  repository.artifactLineage.mockRejectedValueOnce(
    new Error('lineage index missing for artifact_internal_123'),
  );
  mount();
  expect(await screen.findByText("Couldn't read its lineage")).toBeVisible();
  expect(screen.getByText(/Render and Source still show it/u)).toBeVisible();
  expect(screen.queryByText('lineage index missing for artifact_internal_123')).toBeNull();
  await userEvent.click(screen.getByText('Technical details'));
  expect(screen.getByText('lineage index missing for artifact_internal_123')).toBeVisible();
});

/** A pane `width` wide that reports its size, as the browser's observer would. */
function stubPane(width: number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        this.callback([], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  return [
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width),
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600),
  ];
}

it.each([
  { pane: 290, fits: true },
  { pane: 200, fits: false },
])(
  'fits the graph to a $pane px pane only while its names stay readable',
  async ({ pane, fits }) => {
    const spies = stubPane(pane);
    mount();
    await findNode(/Build report/u);
    const canvas = screen.getByRole('region', { name: 'Artifact lineage graph' });
    const layout = canvas.querySelector<HTMLElement>('[data-slot="lineage-layout"]')!;
    const drawn = canvas.querySelector<HTMLElement>('[data-slot="lineage-fit"]')!;
    const room = pane - 2 * 14;
    // The drawing is wider than the pane at 1:1, so it scales.
    expect(parseFloat(layout.style.width)).toBeGreaterThan(room);
    await waitFor(() => expect(layout).toHaveAttribute('data-zoom'));
    if (fits) expect(parseFloat(drawn.style.width)).toBeLessThanOrEqual(room + 0.01);
    else {
      // Below the readable floor the drawing keeps 0.85 and the rest scrolls into view.
      expect(layout).toHaveAttribute('data-zoom', '0.85');
      expect(parseFloat(drawn.style.width)).toBeGreaterThan(room);
    }
    vi.unstubAllGlobals();
    for (const spy of spies) spy.mockRestore();
  },
);
