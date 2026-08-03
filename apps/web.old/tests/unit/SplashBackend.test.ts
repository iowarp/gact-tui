import { describe, expect, it, vi } from 'vitest';
import {
  probePureWebBackend,
  pureWebBackendCandidates,
} from '../../src/routes/splashBackend.js';

const CAPABILITIES = {
  contract_version: '1',
  backend: { name: 'CLIO', version: '1', vendor: 'test' },
  capabilities: {},
  transports: {},
  auth: { schemes: [], current: 'none' },
  extensions: [],
};

describe('splashBackend', () => {
  it('returns the probed backend URL when capabilities responds ok', async () => {
    const fetchImpl = vi.fn(async () => Response.json(CAPABILITIES)) as unknown as typeof fetch;

    const result = await probePureWebBackend({
      baseUrl: 'http://localhost:19000',
      fetchImpl,
      timeoutMs: 500,
    });

    expect(result).toEqual({
      url: 'http://localhost:19000',
      token: '',
      capabilities: CAPABILITIES,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:19000/v1/capabilities',
      expect.objectContaining({ headers: {}, signal: expect.any(AbortSignal) }),
    );
  });

  it('returns null when the probe returns an error status, invalid payload, or throws', async () => {
    const failingStatus = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    const invalidPayload = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;
    const throwing = vi.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    await expect(probePureWebBackend({ fetchImpl: failingStatus })).resolves.toBeNull();
    await expect(probePureWebBackend({ fetchImpl: invalidPayload })).resolves.toBeNull();
    await expect(probePureWebBackend({ fetchImpl: throwing })).resolves.toBeNull();
  });

  it('tries saved candidates before local defaults and preserves tokens', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json(CAPABILITIES)) as unknown as typeof fetch;

    const result = await probePureWebBackend({
      candidates: [
        { url: 'https://stale.example.com/', token: 'old' },
        { url: 'https://live.example.com/', token: 'secret' },
      ],
      fetchImpl,
      timeoutMs: 500,
    });

    expect(result).toEqual({
      url: 'https://live.example.com',
      token: 'secret',
      capabilities: CAPABILITIES,
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://live.example.com/v1/capabilities',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('orders current saved backend, saved fallbacks, then local defaults', () => {
    expect(
      pureWebBackendCandidates(
        {
          currentId: 'remote',
          backends: [
            {
              id: 'local',
              label: 'Local',
              url: 'http://127.0.0.1:17800',
              bearerToken: '',
              kind: 'http',
            },
            {
              id: 'remote',
              label: 'Remote',
              url: 'https://remote.example.com/',
              bearerToken: 'secret',
              kind: 'http',
            },
          ],
        },
        17800,
      ),
    ).toEqual([
      { url: 'https://remote.example.com/', token: 'secret' },
      { url: 'http://127.0.0.1:17800', token: '' },
      { url: 'http://localhost:17800', token: '' },
    ]);
  });
});
