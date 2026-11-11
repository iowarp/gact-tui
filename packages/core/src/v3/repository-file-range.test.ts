import { describe, expect, it, vi } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, TransportRequest } from './transport.js';

describe('ClioRepository.readWorkspaceFileRange', () => {
  it.each([
    [{ start: 0, end: 524_288 }, 'bytes=0-524288'],
    [{ suffix: 4096 }, 'bytes=-4096'],
  ])('reads %o of a workspace file as bytes with a Range header', async (range, header) => {
    const request = vi.fn(async (input: TransportRequest<unknown>) =>
      input.decode(new Uint8Array([1, 2])),
    );
    const repository = new ClioRepository({ request, stream: vi.fn() } as unknown as ClioTransport);
    await expect(repository.readWorkspaceFileRange('ws 1', 'logs/run.log', range)).resolves.toEqual(
      new Uint8Array([1, 2]),
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/v1/workspaces/ws%201/files/read?path=logs%2Frun.log',
        headers: { Range: header },
        responseType: 'bytes',
      }),
    );
  });

  it('rejects a response that is not bytes', async () => {
    const request = vi.fn(async (input: TransportRequest<unknown>) => input.decode('text'));
    const repository = new ClioRepository({ request, stream: vi.fn() } as unknown as ClioTransport);
    await expect(
      repository.readWorkspaceFileRange('ws', 'a.txt', { start: 0, end: 1 }),
    ).rejects.toThrow('Expected a binary response');
  });
});
