import { describe, expect, it, vi } from 'vitest';
import { attemptConnect } from '../../src/routes/ConnectScreenController.js';

describe('ConnectScreenController', () => {
  it('returns a backend handle for successful capabilities probes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await expect(
      attemptConnect({
        url: 'http://127.0.0.1:17800',
        token: 'secret',
        fetchImpl,
      }),
    ).resolves.toEqual({
      backend: {
        url: 'http://127.0.0.1:17800',
        bearerToken: 'secret',
        capabilities: { ok: true },
      },
      reauthNeeded: false,
      revealAdvanced: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:17800/v1/capabilities', {
      headers: { Authorization: 'Bearer secret' },
    });
  });

  it('preserves remote reauth decisions for auth failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{"error":"unauthorized"}', { status: 401 }));

    await expect(
      attemptConnect({
        url: 'https://clio-staging.example.com',
        token: '',
        fetchImpl,
      }),
    ).resolves.toEqual({
      error: 'HTTP 401',
      reauthNeeded: true,
      revealAdvanced: true,
    });
  });
});
