import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';
import { TransportError } from './transport.js';

describe('readWorkspaceHdf5', () => {
  it('GETs the workspace h5grove endpoint as bytes with encoded parameters', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const transport = new RecordingTransport([bytes]);
    const repository = new ClioRepository(transport);
    const controller = new AbortController();

    await expect(
      repository.readWorkspaceHdf5(
        'ws 1',
        'data',
        { file: 'runs/water & ice.h5', path: '/entry/I', selection: '0:10,::2' },
        controller.signal,
      ),
    ).resolves.toBe(bytes);

    const [request] = transport.requests;
    expect(request?.method).toBe('GET');
    expect(request?.responseType).toBe('bytes');
    expect(request?.signal).toBe(controller.signal);
    const url = new URL(`http://service${request?.path ?? ''}`);
    expect(url.pathname).toBe('/v1/workspaces/ws%201/h5grove/data');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      file: 'runs/water & ice.h5',
      path: '/entry/I',
      selection: '0:10,::2',
    });
  });

  it('rejects non-binary responses and passes transport errors through', async () => {
    const repository = new ClioRepository(
      new RecordingTransport(['not bytes', new TransportError('File not found', 404)]),
    );
    await expect(repository.readWorkspaceHdf5('ws', 'meta', {})).rejects.toThrow(
      'Expected a binary response',
    );
    await expect(repository.readWorkspaceHdf5('ws', 'meta', {})).rejects.toMatchObject({
      status: 404,
    });
  });
});
