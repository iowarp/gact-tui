import { describe, expect, it, vi } from 'vitest';
import { probePureWebBackend } from '../../src/routes/splashBackend.js';

describe('splashBackend', () => {
  it('returns the probed backend URL when capabilities responds ok', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch;

    const url = await probePureWebBackend({
      baseUrl: 'http://localhost:19000',
      fetchImpl,
      timeoutMs: 500,
    });

    expect(url).toBe('http://localhost:19000');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:19000/v1/capabilities',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns null when the probe returns an error status or throws', async () => {
    const failingStatus = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    const throwing = vi.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    await expect(probePureWebBackend({ fetchImpl: failingStatus })).resolves.toBeNull();
    await expect(probePureWebBackend({ fetchImpl: throwing })).resolves.toBeNull();
  });
});
