/**
 * Saved connections + autoconnect (gact-tui#332/#338).
 *
 * These semantics existed in the legacy UI and were valuable: the user should
 * not retype a backend URL every session. The registry itself is the KEPT
 * @clio/core backend store — this wraps it with persistence and a
 * last-used marker rather than reimplementing it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  forgetBackend,
  loadRegistry,
  rememberBackend,
  saveRegistry,
  setLastUsed,
} from '../../src/connect/registry';

afterEach(() => localStorage.clear());

describe('connection registry', () => {
  it('starts empty rather than inventing a default entry', () => {
    expect(loadRegistry().backends).toEqual([]);
  });

  it('remembers a backend that connected', () => {
    const next = rememberBackend(loadRegistry(), {
      url: 'http://127.0.0.1:17900',
      label: 'local',
    });
    expect(next.backends).toHaveLength(1);
    expect(next.backends[0]?.url).toBe('http://127.0.0.1:17900');
  });

  it('does not duplicate a backend already known', () => {
    let reg = rememberBackend(loadRegistry(), { url: 'http://a.test', label: 'a' });
    reg = rememberBackend(reg, { url: 'http://a.test', label: 'a again' });
    expect(reg.backends).toHaveLength(1);
  });

  it('survives a round trip through storage', () => {
    saveRegistry(rememberBackend(loadRegistry(), { url: 'http://a.test', label: 'a' }));
    expect(loadRegistry().backends[0]?.url).toBe('http://a.test');
  });

  it('marks the last used backend so the next launch can autoconnect', () => {
    let reg = rememberBackend(loadRegistry(), { url: 'http://a.test', label: 'a' });
    reg = rememberBackend(reg, { url: 'http://b.test', label: 'b' });
    reg = setLastUsed(reg, 'http://b.test');
    saveRegistry(reg);
    expect(loadRegistry().currentId).toBe('http://b.test');
  });

  it('forgets a backend, and clears the marker when it was the current one', () => {
    let reg = rememberBackend(loadRegistry(), { url: 'http://a.test', label: 'a' });
    reg = setLastUsed(reg, 'http://a.test');
    reg = forgetBackend(reg, 'http://a.test');
    expect(reg.backends).toEqual([]);
    // A dangling currentId would make the next launch autoconnect to nothing.
    expect(reg.currentId).toBeNull();
  });

  it('tolerates corrupt storage instead of failing to boot', () => {
    localStorage.setItem('clio.backends.v3', '{not json');
    expect(loadRegistry().backends).toEqual([]);
  });

  it('never persists a bearer token in the registry', () => {
    // Tokens live in the token store (keychain / memory), never here.
    saveRegistry(
      rememberBackend(loadRegistry(), { url: 'http://a.test', label: 'a', bearerToken: 'secret' }),
    );
    expect(JSON.stringify(localStorage)).not.toContain('secret');
  });
});
