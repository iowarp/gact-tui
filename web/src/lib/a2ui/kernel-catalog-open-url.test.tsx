import type { A2UISurface } from '@clio/core/v3';
import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIO_A2UI_CATALOG_ID,
  CLIO_WORKSPACE_CATALOG_ROW,
} from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSessionRegistryOwner } from '@/test-fixtures/a2ui/v0_9_1/test-harness';
import { ClioA2UISurface } from '@/components/clio/a2ui-surface';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
  a2uiCatalogs: vi.fn(),
  a2uiCapabilities: vi.fn(),
}));
const external = vi.hoisted(() => ({ openExternalUrl: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
// The kernel's openUrl function opens through this bridge, not window.open
// directly (window.open never reached the OS browser inside the desktop
// shell — see gact-tui#<external-links>), so these tests assert against it.
vi.mock('@/tauri/external-url', () => ({ openExternalUrl: external.openExternalUrl }));

beforeEach(() => {
  repository.a2uiCatalogs.mockResolvedValue({ rows: [CLIO_WORKSPACE_CATALOG_ROW], rejected: [] });
  repository.a2uiCapabilities.mockResolvedValue({
    agent: { 'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] } },
    client: null,
    selection: null,
  });
  external.openExternalUrl.mockReset();
  external.openExternalUrl.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  repository.a2uiAction.mockClear();
  repository.a2uiCatalogs.mockClear();
  repository.a2uiCapabilities.mockClear();
  vi.restoreAllMocks();
});

const TEST_CATALOG_ID = 'test://kernel-catalog-open-url';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [...KERNEL_COMPONENTS.values()],
  [...KERNEL_FUNCTIONS.values()],
);

function buildOpenUrlSurface(url: string) {
  const surfaceId = 'open-url-surface';
  const processor = new MessageProcessor([testCatalog], async () => undefined, {
    version: 'v0.9.1',
  });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId, catalogId: TEST_CATALOG_ID } },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId,
        components: [
          {
            id: 'root',
            component: 'Button',
            child: 'label',
            action: { functionCall: { call: 'openUrl', args: { url } } },
          },
          { id: 'label', component: 'Text', text: 'Open' },
        ],
      },
    },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the test surface to exist');
  return surface;
}

function openUrlA2uiSurface(url: string): A2UISurface {
  const surfaceId = 'open-url-a2ui-surface';
  return {
    id: surfaceId,
    session_id: 'sess_1',
    catalog_id: CLIO_A2UI_CATALOG_ID,
    protocol_version: '0.9.1',
    revision: 1,
    state: 'ready',
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId, catalogId: CLIO_A2UI_CATALOG_ID } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId,
          components: [
            {
              id: 'root',
              component: 'Button',
              child: 'label',
              action: { functionCall: { call: 'openUrl', args: { url } } },
            },
            { id: 'label', component: 'Text', text: 'Open' },
          ],
        },
      },
    ],
  };
}

function renderA2uiSurface(surface: A2UISurface) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <A2uiSessionRegistryOwner sessionId={surface.session_id}>
        <ClioA2UISurface surface={surface} />
      </A2uiSessionRegistryOwner>
    </QueryClientProvider>,
  );
}

/**
 * The official Basic catalog's `openUrl` (`@a2ui/web_core`'s
 * `OpenUrlImplementation`) opens any `http:`/`https:` URL — S8 known gap,
 * `contract/SPEC.md`. `KERNEL_FUNCTIONS` overrides it (`kernel-catalog.tsx`)
 * to enforce owner decision 11's allowlist (`A2UI_ALLOWED_URL_SCHEMES`:
 * `https:`/`artifact:`/`resource:`, excluding plain `http:`) the same way
 * the render-time media guards (Image/Video/AudioPlayer) do.
 */
describe('kernel openUrl allowlist (owner decision 11)', () => {
  it('opens an allowed https: URL', async () => {
    const surface = buildOpenUrlSurface('https://iowarp.ai/docs');

    render(<A2uiSurface surface={surface} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    await vi.waitFor(() =>
      expect(external.openExternalUrl).toHaveBeenCalledWith('https://iowarp.ai/docs'),
    );
  });

  it('blocks a plain http: URL instead of opening it', async () => {
    const surface = buildOpenUrlSurface('http://iowarp.ai/docs');
    const onError = vi.fn();
    surface.onError.subscribe(onError);

    render(<A2uiSurface surface={surface} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    expect(external.openExternalUrl).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        message: expect.stringContaining('"http:" is not an allowed URL scheme'),
      }),
    );
  });

  it('blocks a non-http(s) scheme such as javascript:', async () => {
    // eslint-disable-next-line no-script-url -- proving the allowlist blocks it, never executed
    const surface = buildOpenUrlSurface('javascript:alert(1)');
    const onError = vi.fn();
    surface.onError.subscribe(onError);

    render(<A2uiSurface surface={surface} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    expect(external.openExternalUrl).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('reports a failed open through the same wire-reportable code', async () => {
    external.openExternalUrl.mockRejectedValue(new Error('The scope rejected this URL.'));
    const surface = buildOpenUrlSurface('https://iowarp.ai/docs');
    const onError = vi.fn();
    surface.onError.subscribe(onError);

    render(<A2uiSurface surface={surface} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'VALIDATION_FAILED', message: 'The scope rejected this URL.' }),
      ),
    );
  });
});

/**
 * The `onError` cases above prove the kernel function itself. This describe
 * renders through `ClioA2UISurface` (the real wrapper, `a2ui-surface.tsx`) so
 * a blocked click is proven where a person actually sees it: words in the
 * DOM, not only a subscribed spy — S8 gact-tui#409 item 1 adversarial
 * finding ("a blocked openUrl click is silent").
 */
describe('kernel openUrl allowlist — rendered card (owner decision 11)', () => {
  it('opens an allowed https: URL without any local notice', async () => {
    renderA2uiSurface(openUrlA2uiSurface('https://iowarp.ai/docs'));

    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    await vi.waitFor(() =>
      expect(external.openExternalUrl).toHaveBeenCalledWith('https://iowarp.ai/docs'),
    );
    expect(screen.queryByText(/not an allowed URL scheme/u)).not.toBeInTheDocument();
  });

  it('words a blocked http: click in the card instead of leaving it silent', async () => {
    renderA2uiSurface(openUrlA2uiSurface('http://iowarp.ai/docs'));

    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    expect(external.openExternalUrl).not.toHaveBeenCalled();
    expect(await screen.findByText(/"http:" is not an allowed URL scheme/u)).toBeVisible();
  });

  it('still posts the VALIDATION_FAILED report to the wire alongside the worded notice', async () => {
    const surface = openUrlA2uiSurface('http://iowarp.ai/docs');
    renderA2uiSurface(surface);

    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));

    await screen.findByText(/"http:" is not an allowed URL scheme/u);
    expect(repository.a2uiAction).toHaveBeenCalledWith(surface.session_id, {
      version: 'v0.9.1',
      error: expect.objectContaining({
        code: 'VALIDATION_FAILED',
        surfaceId: surface.id,
        message: expect.stringContaining('"http:" is not an allowed URL scheme'),
      }),
    });
  });
});
