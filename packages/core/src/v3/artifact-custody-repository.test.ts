import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import { TransportError } from './transport.js';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    const response = this.responses.shift();
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve(request.decode(response));
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}

describe('artifact custody repository contracts', () => {
  it('follows the server-authorized workspace path for non-CAS artifact content', async () => {
    const transport = new RecordingTransport([
      new TransportError('Workspace-referenced artifact', 409, 'custody_not_cas', {
        fetch_via: '/v1/workspaces/ws_1/files/read?path=results%2Fanalysis.py',
      }),
      'print("authoritative artifact")\n',
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.readArtifactText('artifact 1')).resolves.toBe(
      'print("authoritative artifact")\n',
    );
    expect(transport.requests.map(({ path, responseType }) => ({ path, responseType }))).toEqual([
      { path: '/v1/artifacts/artifact%201/bytes', responseType: 'text' },
      {
        path: '/v1/workspaces/ws_1/files/read?path=results%2Fanalysis.py',
        responseType: 'text',
      },
    ]);
  });

  it('preserves binary artifact bytes across server-authorized custody recovery', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const transport = new RecordingTransport([
      new TransportError('Workspace-referenced artifact', 409, 'custody_not_cas', {
        fetch_via: '/v1/workspaces/ws_1/files/read?path=results%2Fplot.png',
      }),
      bytes,
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.readArtifactBytes('plot 1')).resolves.toEqual(bytes);
    expect(transport.requests.map(({ path, responseType }) => ({ path, responseType }))).toEqual([
      { path: '/v1/artifacts/plot%201/bytes', responseType: 'bytes' },
      {
        path: '/v1/workspaces/ws_1/files/read?path=results%2Fplot.png',
        responseType: 'bytes',
      },
    ]);
  });

  it('refuses a missing artifact payload instead of reading a guessed workspace path', async () => {
    const transport = new RecordingTransport([
      new TransportError('Historical registry entry unavailable', 404, 'not_found'),
      new Uint8Array([137, 80, 78, 71]),
    ]);
    const repository = new ClioRepository(transport);

    await expect(
      repository.readArtifactBytesFor({
        id: 'artifact old',
        session_id: 'sess_1',
        workspace_id: 'ws_1',
        name: 'plots/monthly result.png',
        media_type: 'image/png',
        uri: 'artifact://ws_1/plots/monthly result.png@v1',
        fetch_path: '/v1/artifacts/artifact%20old/bytes',
      }),
    ).rejects.toMatchObject({ name: 'TransportError', status: 404, code: 'not_found' });
    expect(transport.requests.map(({ path, responseType }) => ({ path, responseType }))).toEqual([
      { path: '/v1/artifacts/artifact%20old/bytes', responseType: 'bytes' },
    ]);
  });
});
