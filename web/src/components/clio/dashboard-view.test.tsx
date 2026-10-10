import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardReport } from '@clio/core/v3';
import {
  CLIO_A2UI_CATALOG_ID,
  CLIO_WORKSPACE_CATALOG_ROW,
} from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSessionRegistryOwner } from '@/test-fixtures/a2ui/v0_9_1/test-harness';
import { createSelectionActionRegistry } from '@/lib/selection-actions';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { DashboardResourceView, DashboardView } from './dashboard-view';
import { toast } from 'sonner';
import { ChartLineIcon } from 'lucide-react';
import { FileViewerShell } from './file-viewer-shell';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn(),
  a2uiCatalogs: vi.fn(),
  a2uiCapabilities: vi.fn(),
  captureDashboard: vi.fn(),
  prepareDashboardExport: vi.fn(),
  prepareDashboardImageExport: vi.fn(),
  reportA2uiViewer: vi.fn(),
  readWorkspaceFileBytes: vi.fn(),
}));
const downloads = vi.hoisted(() => ({
  downloadUrl: vi.fn(),
  downloadBlob: vi.fn(),
  downloadBytes: vi.fn(),
}));
const capture = vi.hoisted(() => vi.fn());
vi.mock('./a2ui-region-capture', async (original) => ({
  ...(await original<typeof import('./a2ui-region-capture')>()),
  captureRenderedSurfacePng: capture,
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://localhost:8100/base' } }),
}));
vi.mock('@/lib/session-export/renderer-assets', () => ({
  loadSessionReviewRenderer: async () => ({ javascript: 'renderer', stylesheet: 'styles' }),
}));
vi.mock('./surface-export', async (original) => ({
  ...(await original<typeof import('./surface-export')>()),
  ...downloads,
}));
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

const surfaceId = 'dashboard_authored';
const report: DashboardReport = {
  format: 'clio.dashboard.v1',
  id: 'authored',
  title: 'Design evolution',
  created_at: '2026-10-08T00:00:00Z',
  session_id: 'sess_dash',
  definition_path: 'reports/design.dashboard.document.json',
  definition: {},
  sources: [],
  surface: {
    id: surfaceId,
    session_id: 'sess_dash',
    catalog_id: CLIO_A2UI_CATALOG_ID,
    protocol_version: '0.9.1',
    revision: 3,
    state: 'ready',
    part_id: 'dashboard_authored',
    message_revisions: [1, 2, 3],
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId, catalogId: CLIO_A2UI_CATALOG_ID } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId,
          components: [
            {
              id: 'root',
              component: 'Tabs',
              tabs: [
                { title: 'Overview', child: 'field' },
                { title: 'Comparisons', child: 'shared' },
              ],
            },
            {
              id: 'field',
              component: 'TextField',
              label: 'Scenario',
              value: { path: '/scenario' },
            },
            { id: 'shared', component: 'Text', text: { path: '/scenario' } },
          ],
        },
      },
      { version: 'v0.9.1', updateDataModel: { surfaceId, value: { scenario: 'Baseline' } } },
    ],
  },
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 100,
    x: 0,
    y: 0,
    top: 0,
    right: 200,
    bottom: 100,
    left: 0,
  } as DOMRect);
  repository.reportA2uiViewer.mockResolvedValue([]);
  repository.a2uiCatalogs.mockResolvedValue({ rows: [CLIO_WORKSPACE_CATALOG_ROW], rejected: [] });
  repository.a2uiCapabilities.mockResolvedValue({
    agent: { 'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] } },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function show(offline = false, savedReport = report) {
  const registry = createSelectionActionRegistry();
  const reference = vi.fn();
  registry.register({
    id: 'reference',
    icon: ChartLineIcon,
    label: 'Reference',
    kinds: ['data-surface-zone'],
    order: 1,
    run: reference,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SelectionActionsContext.Provider value={registry}>
        <A2uiSessionRegistryOwner sessionId={savedReport.session_id}>
          <DashboardView report={savedReport} artifactId="artifact_dashboard" offline={offline} />
        </A2uiSessionRegistryOwner>
      </SelectionActionsContext.Provider>
    </QueryClientProvider>,
  );
  return reference;
}

describe('authored dashboard', () => {
  it.each(['info', 'warning', 'critical'])(
    'reports an authored %s callout as rendered content',
    async (severity) => {
      const savedReport = structuredClone(report);
      savedReport.surface.messages[1] = {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId,
          components: [
            {
              id: 'root',
              component: 'clio.callout.v1',
              severity,
              title: 'Verification notes',
              body: 'Created does not mean fully tested.',
            },
          ],
        },
      };
      show(false, savedReport);
      expect(await screen.findByRole('alert')).toHaveTextContent('Verification notes');
      await waitFor(() => expect(repository.reportA2uiViewer).toHaveBeenCalled());
      await waitFor(() =>
        expect(repository.reportA2uiViewer.mock.calls.at(-1)![1].ready).toBe(true),
      );
      expect(repository.reportA2uiViewer.mock.calls.at(-1)![1].state.readiness.detail).toBe('');
    },
  );
  it('offers PNG, bundled HTML and original JSON from the fixed file download button', async () => {
    capture.mockResolvedValue(new Blob(['pixels'], { type: 'image/png' }));
    repository.prepareDashboardImageExport.mockResolvedValue({
      download_path: '/png',
      filename: 'design.png',
    });
    repository.captureDashboard.mockResolvedValue({
      sessions: {},
      responses: {},
      tables: {},
      failures: [],
    });
    repository.prepareDashboardExport.mockResolvedValue({
      download_path: '/html',
      filename: 'design.html',
    });
    const original = new TextEncoder().encode(JSON.stringify(report));
    repository.readWorkspaceFileBytes.mockResolvedValue(original);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <A2uiSessionRegistryOwner sessionId={report.session_id}>
          <FileViewerShell
            source={{
              kind: 'workspace',
              workspaceId: 'ws',
              path: 'design.dashboard.json',
              mediaType: 'application/json',
            }}
            tabs={[
              {
                value: 'preview',
                label: 'Preview',
                icon: ChartLineIcon,
                content: (
                  <DashboardResourceView
                    content={JSON.stringify(report)}
                    artifactId="artifact_dashboard"
                  />
                ),
              },
            ]}
          />
        </A2uiSessionRegistryOwner>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    const toolbar = document.querySelector('[data-slot="viewer-toolbar"]') as HTMLElement;
    for (const label of [
      'PNG image (displayed view)',
      'HTML dashboard (all tabs and data)',
      'Original file',
    ]) {
      await user.click(within(toolbar).getByRole('button', { name: 'Download file' }));
      await user.click(await screen.findByRole('menuitem', { name: label }));
      await waitFor(() =>
        expect(within(toolbar).getByRole('button', { name: 'Download file' })).toBeEnabled(),
      );
    }
    expect(repository.prepareDashboardImageExport).toHaveBeenCalledOnce();
    expect(repository.prepareDashboardExport).toHaveBeenCalledOnce();
    expect(repository.captureDashboard).toHaveBeenCalledWith(report.session_id, [report.surface]);
    expect(downloads.downloadBytes).toHaveBeenCalledWith(
      original,
      'application/json',
      'design.dashboard.json',
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
  it('prepares displayed PNG pixels through the same download door as HTML', async () => {
    capture.mockResolvedValue(new Blob(['pixels'], { type: 'image/png' }));
    repository.prepareDashboardImageExport.mockResolvedValue({
      download_path: '/v1/session-export-downloads/image',
      filename: 'design.png',
      artifact_id: 'image-artifact',
    });
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.hover(screen.getByText('Download'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'PNG image (displayed view)' }));
    await waitFor(() =>
      expect(repository.prepareDashboardImageExport).toHaveBeenCalledWith(
        report.session_id,
        'artifact_dashboard',
        btoa('pixels'),
      ),
    );
    expect(capture.mock.calls[0][0]).toBe(screen.getByRole('article'));
    expect(downloads.downloadUrl).toHaveBeenCalledWith(
      'http://localhost:8100/base/v1/session-export-downloads/image',
      'design.png',
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
  it('preserves the local view and capture epoch during unrelated session renders', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 100,
    } as DOMRect);
    const client = new QueryClient();
    const content = JSON.stringify(report);
    const pane = (tick: number) => (
      <QueryClientProvider client={client}>
        <A2uiSessionRegistryOwner sessionId={report.session_id}>
          <span>{tick}</span>
          <DashboardResourceView content={content} artifactId="artifact_dashboard" />
        </A2uiSessionRegistryOwner>
      </QueryClientProvider>
    );
    const mounted = render(pane(0));
    const user = userEvent.setup();
    const field = await screen.findByRole('textbox', { name: 'Scenario' });
    await user.clear(field);
    await user.type(field, 'Human choice');
    await user.click(screen.getByRole('tab', { name: 'Comparisons' }));
    await waitFor(() => expect(repository.reportA2uiViewer.mock.calls.length).toBeGreaterThan(2), {
      timeout: 4000,
    });
    const before = repository.reportA2uiViewer.mock.calls.at(-1)![1];
    const count = repository.reportA2uiViewer.mock.calls.length;
    mounted.rerender(pane(1));
    await waitFor(
      () => expect(repository.reportA2uiViewer.mock.calls.length).toBeGreaterThan(count),
      {
        timeout: 4000,
      },
    );
    const after = repository.reportA2uiViewer.mock.calls.at(-1)![1];
    expect(after.viewer_id).toBe(before.viewer_id);
    expect(after.view_revision).toBe(before.view_revision);
    expect(screen.getByRole('tab', { name: 'Comparisons' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Human choice')).toBeVisible();
  });

  it.each([false, true])('opens a methodology Modal locally (offline=%s)', async (offline) => {
    const components = [
      { id: 'root', component: 'Modal', trigger: 'open', content: 'method' },
      {
        id: 'open',
        component: 'Button',
        child: 'label',
        action: { event: { name: 'methodology.open' } },
      },
      { id: 'label', component: 'Text', text: 'Open methodology' },
      { id: 'method', component: 'Text', text: 'Methods and source evidence' },
    ];
    const savedReport = structuredClone(report);
    savedReport.definition.components = components;
    savedReport.surface.messages[1] = {
      version: 'v0.9.1',
      updateComponents: { surfaceId, components },
    };
    show(offline, savedReport);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open methodology' }));
    expect(await screen.findByText('Methods and source evidence')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '×' }));
    expect(screen.queryByText('Methods and source evidence')).toBeNull();
    expect(repository.a2uiAction).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Reference this dashboard in the conversation to ask the agent.'),
    ).toBeNull();
  });

  it('keeps tabs interconnected through the real shared A2UI data model', async () => {
    show();
    const user = userEvent.setup();
    const field = await screen.findByRole('textbox', { name: 'Scenario' });
    await user.clear(field);
    await user.type(field, 'Evolution two');
    await user.click(screen.getByRole('tab', { name: 'Comparisons' }));
    expect(await screen.findByText('Evolution two')).toBeVisible();
    expect(repository.a2uiAction).not.toHaveBeenCalled();
  });

  it('references the owning artifact and editable source document', async () => {
    const reference = show();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reference this' }));
    expect(reference).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown: expect.stringContaining('artifact://artifact_dashboard'),
      }),
    );
    expect(reference.mock.calls[0][0].markdown).toContain(report.definition_path);
  });

  it('captures only the authored dashboard and downloads a bundled HTML through the common helper', async () => {
    const snapshot = { sessions: {}, responses: {}, tables: {}, failures: [] };
    repository.captureDashboard.mockResolvedValue(snapshot);
    repository.prepareDashboardExport.mockResolvedValue({
      download_path: '/v1/session-export-downloads/abc',
      filename: 'design.html',
    });
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.hover(screen.getByText('Download'));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'HTML dashboard (all tabs and data)' }),
    );
    await waitFor(() => {
      expect(toast.error).not.toHaveBeenCalled();
      expect(downloads.downloadUrl).toHaveBeenCalledWith(
        'http://localhost:8100/base/v1/session-export-downloads/abc',
        'design.html',
      );
    });
    expect(repository.captureDashboard).toHaveBeenCalledWith(report.session_id, [report.surface]);
    expect(repository.prepareDashboardExport).toHaveBeenCalledWith(
      report.session_id,
      'artifact_dashboard',
      { javascript: 'renderer', stylesheet: 'styles' },
      snapshot,
    );
  });

  it('keeps saved tabs interactive offline while omitting live agent and export actions', async () => {
    show(true);
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Comparisons' }));
    expect(await screen.findByText('Baseline')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(repository.a2uiAction).not.toHaveBeenCalled();
  });

  it('words an invalid saved definition rather than crashing the side panel', () => {
    render(<DashboardResourceView content="{" artifactId="artifact_bad" />);
    expect(screen.getByText('Dashboard unavailable')).toBeVisible();
  });
});
