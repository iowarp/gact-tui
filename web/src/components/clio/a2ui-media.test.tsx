import { ClioRepository, TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A2uiReferenceSessionProvider } from '@/lib/a2ui/reference-session';
import { BrowserClioTransport } from '@/lib/transport/browser-transport';

const PNG = new Uint8Array([137, 80, 78, 71]);
const AWKWARD = 'plot #1 & more+50%.png';

const repository = vi.hoisted(() => ({
  current: undefined as unknown,
}));
const fake = {
  resolveA2uiReference: vi.fn(),
  readA2uiReferenceBytes: vi.fn(),
};

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository.current }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://remote.example:8790' } }),
}));

import { A2uiMedia } from './a2ui-media';

function resolution(uri: string, overrides: Record<string, unknown> = {}) {
  return {
    uri,
    kind: uri.includes('res_') ? 'resource' : 'artifact',
    workspace_id: 'ws_1',
    name: AWKWARD,
    media_type: 'image/png',
    size_bytes: PNG.length,
    artifact_id: 'artifact_abc',
    fetch_path: '/v1/artifacts/artifact_abc/bytes',
    ...overrides,
  };
}

let objectUrls = 0;
beforeEach(() => {
  repository.current = fake;
  objectUrls = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:a2ui-media-${++objectUrls}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.clearAllMocks();
});

function renderMedia(ui: ReactNode, { withSession = true } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {withSession ? (
        <A2uiReferenceSessionProvider value="sess_1">{ui}</A2uiReferenceSessionProvider>
      ) : (
        ui
      )}
    </QueryClientProvider>,
  );
}

describe('A2uiMedia', () => {
  it.each([
    'artifact://artifact_abc',
    'artifact:artifact_abc',
    'artifact_abc',
    `artifact://ws_1/${AWKWARD}@v1`,
    'resource://ws_1/res_abc',
    'resource://res_abc',
    'resource:res_abc',
    'res_abc',
  ])('renders %s from a blob: URL read through the repository', async (uri) => {
    fake.resolveA2uiReference.mockResolvedValue(resolution(uri));
    fake.readA2uiReferenceBytes.mockResolvedValue(PNG);

    renderMedia(<A2uiMedia componentId="img" kind="image" label="Plot" url={uri} />);

    expect(await screen.findByRole('img', { name: 'Plot' })).toHaveAttribute(
      'src',
      'blob:a2ui-media-1',
    );
    expect(fake.resolveA2uiReference).toHaveBeenCalledWith('sess_1', uri, expect.any(AbortSignal));
    expect(fake.readA2uiReferenceBytes).toHaveBeenCalledWith(
      expect.objectContaining({ fetch_path: '/v1/artifacts/artifact_abc/bytes' }),
      expect.any(AbortSignal),
    );
  });

  it('sends the bearer to a remote CLIO for both the resolve and the byte read', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/references/resolve')) {
        return new Response(JSON.stringify(resolution(`artifact://ws_1/${AWKWARD}@v1`)), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
    });
    repository.current = new ClioRepository(
      new BrowserClioTransport({
        endpoint: 'http://remote.example:8790',
        token: 'test-token-a2',
        fetcher: fetcher as unknown as typeof fetch,
      }),
    );

    renderMedia(
      <A2uiMedia
        componentId="img"
        kind="image"
        label="Plot"
        url={`artifact://ws_1/${AWKWARD}@v1`}
      />,
    );

    expect(await screen.findByRole('img', { name: 'Plot' })).toHaveAttribute(
      'src',
      'blob:a2ui-media-1',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [resolveCall, bytesCall] = fetcher.mock.calls as unknown as [
      [string, RequestInit],
      [string, RequestInit],
    ];
    const resolveUrl = new URL(resolveCall[0]);
    expect(resolveUrl.origin).toBe('http://remote.example:8790');
    expect(resolveUrl.pathname).toBe('/v1/sessions/sess_1/references/resolve');
    expect(resolveUrl.searchParams.get('uri')).toBe(`artifact://ws_1/${AWKWARD}@v1`);
    expect(bytesCall[0]).toBe('http://remote.example:8790/v1/artifacts/artifact_abc/bytes');
    for (const [, init] of [resolveCall, bytesCall]) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token-a2');
    }
  });

  it('revokes the blob: URL when the media unmounts', async () => {
    fake.resolveA2uiReference.mockResolvedValue(resolution('artifact_abc'));
    fake.readA2uiReferenceBytes.mockResolvedValue(PNG);
    const view = renderMedia(
      <A2uiMedia componentId="img" kind="image" label="Plot" url="artifact_abc" />,
    );
    await screen.findByRole('img', { name: 'Plot' });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    view.unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a2ui-media-1');
  });

  it.each([
    [
      new TransportError('nope', 401, 'authentication_required'),
      'authentication_required',
      /access token/u,
    ],
    [
      new TransportError('gone', 404, 'reference_not_found'),
      'reference_not_found',
      /not registered/u,
    ],
    [new TransportError('offline'), 'unreachable', /could not be reached/u],
  ])('shows a typed reason instead of a broken image (%s)', async (error, code, text) => {
    fake.resolveA2uiReference.mockRejectedValue(error);

    renderMedia(<A2uiMedia componentId="img" kind="image" label="Plot" url="artifact_abc" />);

    // A transient network failure is retried once (after ~1s) before it is final.
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(alert).toHaveAttribute('data-reason', code);
    expect(alert).toHaveTextContent(text);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('names a byte read the element cannot decode, instead of a broken image', async () => {
    fake.resolveA2uiReference.mockResolvedValue(resolution('artifact_abc'));
    fake.readA2uiReferenceBytes.mockResolvedValue(PNG);
    renderMedia(<A2uiMedia componentId="img" kind="image" label="Plot" url="artifact_abc" />);

    fireEvent.error(await screen.findByRole('img', { name: 'Plot' }));

    expect(await screen.findByRole('alert')).toHaveAttribute('data-reason', 'undisplayable');
  });

  it('never auto-loads external https media; it offers an explicit link', async () => {
    renderMedia(
      <A2uiMedia
        componentId="img"
        kind="image"
        label="Plot"
        url="https://images.example.org/a.png"
      />,
    );

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveAttribute('data-reason', 'external_media_not_loaded');
    expect(screen.getByRole('link', { name: /images\.example\.org/u })).toHaveAttribute(
      'href',
      'https://images.example.org/a.png',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(fake.resolveA2uiReference).not.toHaveBeenCalled();
  });

  it('keeps blocking executable schemes before anything resolves', async () => {
    renderMedia(<A2uiMedia componentId="img" kind="image" url="javascript:alert(1)" />);
    expect(await screen.findByRole('alert')).toHaveAttribute('data-reason', 'url_blocked');
    expect(fake.resolveA2uiReference).not.toHaveBeenCalled();
  });

  it('says so when no conversation owns the surface', async () => {
    renderMedia(<A2uiMedia componentId="img" kind="image" url="artifact_abc" />, {
      withSession: false,
    });
    expect(await screen.findByRole('alert')).toHaveAttribute('data-reason', 'session_unavailable');
    expect(fake.resolveA2uiReference).not.toHaveBeenCalled();
  });

  it.each([
    ['video', 'resource:res_clip'],
    ['audio', 'artifact://artifact_tone'],
  ] as const)('plays %s from a blob: URL', async (kind, uri) => {
    fake.resolveA2uiReference.mockResolvedValue(
      resolution(uri, { media_type: kind === 'video' ? 'video/mp4' : 'audio/wav' }),
    );
    fake.readA2uiReferenceBytes.mockResolvedValue(PNG);
    const view = renderMedia(<A2uiMedia componentId="m" kind={kind} label="Clip" url={uri} />);
    await waitFor(() =>
      expect(view.container.querySelector(kind)).toHaveAttribute('src', 'blob:a2ui-media-1'),
    );
  });
});
