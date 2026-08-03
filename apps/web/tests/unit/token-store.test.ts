/**
 * Bearer-token storage contract (gact-tui#338, addressing #263).
 *
 * The legacy app kept bearer tokens in localStorage. These cases lock the
 * replacement: never localStorage, and never a silent downgrade.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearToken,
  loadToken,
  persistence,
  persistenceNote,
  resetMemoryTokens,
  saveToken,
} from '../../src/connections/tokenStore';

afterEach(() => {
  resetMemoryTokens();
  localStorage.clear();
});

describe('token store (browser)', () => {
  it('reports memory-only persistence outside the desktop shell', () => {
    expect(persistence()).toBe('memory-only');
  });

  it('explains WHY the token will not persist', () => {
    // A token that silently vanishes between sessions reads as a bug. The
    // reason has to be available to the UI.
    expect(persistenceNote()).toMatch(/this tab only/i);
    expect(persistenceNote()).toMatch(/re-enter/i);
  });

  it('round-trips a token in memory', async () => {
    await saveToken('conn-a', 'secret-a');
    expect(await loadToken('conn-a')).toBe('secret-a');
  });

  it('keeps tokens separated per connection', async () => {
    await saveToken('conn-a', 'secret-a');
    await saveToken('conn-b', 'secret-b');
    expect(await loadToken('conn-a')).toBe('secret-a');
    expect(await loadToken('conn-b')).toBe('secret-b');
  });

  it('NEVER writes a token to localStorage', async () => {
    await saveToken('conn-a', 'super-secret-value');
    const dump = JSON.stringify(localStorage);
    expect(dump).not.toContain('super-secret-value');
    expect(localStorage.length).toBe(0);
  });

  it('clears a token', async () => {
    await saveToken('conn-a', 'secret-a');
    await clearToken('conn-a');
    expect(await loadToken('conn-a')).toBeUndefined();
  });

  it('returns undefined for an unknown connection rather than a stale one', async () => {
    await saveToken('conn-a', 'secret-a');
    expect(await loadToken('conn-zzz')).toBeUndefined();
  });
});
