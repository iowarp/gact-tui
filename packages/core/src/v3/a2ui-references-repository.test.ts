import { describe, expect, it } from 'vitest';
import { checkA2uiUrlScheme, isClioReference } from './a2ui/index.js';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';
import { TransportError } from './transport.js';

const AWKWARD = 'plot #1 & more+50%.png';

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    uri: 'artifact://artifact_abc',
    kind: 'artifact',
    workspace_id: 'ws_1',
    name: AWKWARD,
    media_type: 'image/png',
    size_bytes: 4,
    artifact_id: 'artifact_abc',
    fetch_path: '/v1/artifacts/artifact_abc/bytes',
    ...overrides,
  };
}

function queryUri(path: string): string | null {
  return new URL(`http://service${path}`).searchParams.get('uri');
}

describe('resolveA2uiReference', () => {
  it.each([
    'artifact://artifact_abc',
    'artifact:artifact_abc',
    'artifact_abc',
    `artifact://ws_1/${AWKWARD}@v1`,
    'resource://ws_1/res_abc',
    'resource://res_abc',
    'resource:res_abc',
    'res_abc',
  ])('sends %s verbatim as ONE percent-encoded query value', async (uri) => {
    const transport = new RecordingTransport([resolution({ uri })]);
    const repository = new ClioRepository(transport);

    const resolved = await repository.resolveA2uiReference('sess_1', uri);

    expect(resolved.artifact_id).toBe('artifact_abc');
    const [request] = transport.requests;
    expect(request!.method).toBe('GET');
    expect(request!.path.startsWith('/v1/sessions/sess_1/references/resolve?')).toBe(true);
    expect(request!.path).not.toContain('#');
    expect(queryUri(request!.path)).toBe(uri);
  });

  it('refuses a resolution whose fetch path is not a service route', async () => {
    const transport = new RecordingTransport([resolution({ fetch_path: 'https://elsewhere/x' })]);
    await expect(
      new ClioRepository(transport).resolveA2uiReference('sess_1', 'artifact_abc'),
    ).rejects.toThrow();
  });
});

describe('readA2uiReferenceBytes', () => {
  it('reads an artifact through its fetch path', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const transport = new RecordingTransport([bytes]);
    const read = await new ClioRepository(transport).readA2uiReferenceBytes(resolution() as never);
    expect(read).toBe(bytes);
    expect(transport.requests[0]!.path).toBe('/v1/artifacts/artifact_abc/bytes');
    expect(transport.requests[0]!.responseType).toBe('bytes');
  });

  it('follows only the server-authorized custody redirect, verbatim', async () => {
    const fetchVia = '/v1/workspaces/ws_1/files/read?path=plot%20%231%20%26%20more%2B50%25.png';
    const bytes = new Uint8Array([9]);
    const transport = new RecordingTransport([
      new TransportError('custody', 409, 'custody_not_cas', { fetch_via: fetchVia }),
      bytes,
    ]);
    const read = await new ClioRepository(transport).readA2uiReferenceBytes(resolution() as never);
    expect(read).toBe(bytes);
    expect(transport.requests.map((request) => request.path)).toEqual([
      '/v1/artifacts/artifact_abc/bytes',
      fetchVia,
    ]);
  });

  it('reads a resource through its content route and never follows a redirect', async () => {
    const transport = new RecordingTransport([
      new TransportError('custody', 409, 'custody_not_cas', { fetch_via: '/v1/other' }),
    ]);
    await expect(
      new ClioRepository(transport).readA2uiReferenceBytes(
        resolution({
          kind: 'resource',
          resource_id: 'res_abc',
          artifact_id: undefined,
          fetch_path: '/v1/workspaces/ws_1/resources/res_abc/content',
        }) as never,
      ),
    ).rejects.toMatchObject({ code: 'custody_not_cas' });
    expect(transport.requests.map((request) => request.path)).toEqual([
      '/v1/workspaces/ws_1/resources/res_abc/content',
    ]);
  });
});

describe('reference detection', () => {
  it.each([
    ['artifact://artifact_abc', true],
    ['artifact:artifact_abc', true],
    ['resource://ws/res_abc', true],
    ['RESOURCE:res_abc', true],
    ['artifact_abc', true],
    ['res_abc', true],
    ['https://example.org/a.png', false],
    ['res_../x', false],
    ['plot.png', false],
  ])('isClioReference(%s) is %s', (value, expected) => {
    expect(isClioReference(value)).toBe(expected);
  });

  it('admits bare CLIO ids through the render-time URL guard', () => {
    expect(checkA2uiUrlScheme('artifact_abc')).toEqual({ ok: true });
    expect(checkA2uiUrlScheme('res_abc')).toEqual({ ok: true });
    expect(checkA2uiUrlScheme('res_../x').ok).toBe(false);
    expect(checkA2uiUrlScheme('javascript:alert(1)').ok).toBe(false);
  });
});
