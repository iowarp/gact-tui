import type { LanguageModelPreset, ProviderHandshake } from '@clio/core/v3';
import { describe, expect, it, vi } from 'vitest';
import { signedInProviderReady, verifySignedInProvider } from './provider-sign-in-verify';

function preset(overrides: Partial<LanguageModelPreset> = {}): LanguageModelPreset {
  return {
    id: 'copilot',
    provider_id: 'copilot',
    label: 'GitHub Copilot',
    provider: 'copilot',
    litellm_prefix: '',
    requires_api_key: false,
    auth_method: 'oauth',
    is_authenticated: false,
    supports_live_catalog: true,
    supports_vision: false,
    configuration_fields: [],
    ...overrides,
  } as LanguageModelPreset;
}

const handshake = (auth: ProviderHandshake['auth']): ProviderHandshake =>
  ({ connectivity: 'ok', auth, models: [], source: 'live', generated_at: '' }) as ProviderHandshake;

const fast = { pollMs: 1, checkEveryMs: 0 };

describe('signedInProviderReady', () => {
  it('is ready only when signed in and reported ready (or with no status)', () => {
    expect(signedInProviderReady(preset({ is_authenticated: true, status: 'ready' }))).toBe(true);
    expect(signedInProviderReady(preset({ is_authenticated: true }))).toBe(true);
    expect(signedInProviderReady(preset({ is_authenticated: true, status: 'unknown' }))).toBe(
      false,
    );
    expect(signedInProviderReady(preset({ status: 'ready' }))).toBe(false);
    expect(signedInProviderReady(undefined)).toBe(false);
  });
});

describe('verifySignedInProvider', () => {
  it('complete → verifying → ready: keeps reading and checking until the agent reports ready', async () => {
    const reads = [
      preset({ status: 'install_required' }),
      preset({ status: 'auth_required' }),
      preset({ is_authenticated: true, status: 'ready' }),
    ];
    const read = vi.fn(async () => reads.shift());
    const check = vi.fn(async () => handshake('rejected'));

    const result = await verifySignedInProvider({
      read,
      check,
      signal: new AbortController().signal,
      ...fast,
    });

    expect(result.ready).toBe(true);
    expect(read).toHaveBeenCalledTimes(3);
    // The provider itself is asked on every round it still reads not-ready.
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('a passing check counts once the agent reports the provider signed in', async () => {
    const read = vi.fn(async () => preset({ is_authenticated: true, status: 'unknown' }));
    const check = vi.fn(async () => handshake('ok'));

    const result = await verifySignedInProvider({
      read,
      check,
      signal: new AbortController().signal,
      ...fast,
    });

    expect(result).toEqual({ ready: true, check: handshake('ok') });
  });

  it('keeps going through a failed read or check', async () => {
    const read = vi
      .fn<() => Promise<LanguageModelPreset | undefined>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(preset({ is_authenticated: true, status: 'ready' }));
    const check = vi.fn().mockRejectedValue(new Error('busy'));

    await expect(
      verifySignedInProvider({ read, check, signal: new AbortController().signal, ...fast }),
    ).resolves.toMatchObject({ ready: true });
  });

  it('gives up after its timeout, not ready', async () => {
    const read = vi.fn(async () => preset());
    const check = vi.fn(async () => handshake('rejected'));

    const result = await verifySignedInProvider({
      read,
      check,
      signal: new AbortController().signal,
      pollMs: 1,
      checkEveryMs: 1000,
      timeoutMs: 20,
    });

    expect(result.ready).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const read = vi.fn(async () => {
      controller.abort();
      return preset();
    });

    const result = await verifySignedInProvider({
      read,
      check: vi.fn(async () => handshake('rejected')),
      signal: controller.signal,
      pollMs: 1000,
    });

    expect(result.ready).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
