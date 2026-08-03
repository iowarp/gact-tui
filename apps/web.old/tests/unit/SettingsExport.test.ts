/**
 * 1.0 item 7 — Settings export/import round-trip + security guarantees.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildEnvelope,
  collectPrefs,
  importSettings,
} from '../../src/settings-export.js';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('Settings export/import (1.0 item 7)', () => {
  it('collects every clio.* key EXCEPT the backend registry', () => {
    localStorage.setItem('clio.density.v1', 'verbose');
    localStorage.setItem('clio.locale.v1', 'es');
    localStorage.setItem('clio.notif-prefs.v1', '{"turnCompletions":false}');
    // Credentials — must never be exported.
    localStorage.setItem('clio.backends.v1', '{"backends":[{"bearerToken":"sec"}]}');
    // Non-clio keys — not ours to export.
    localStorage.setItem('other-app.key', 'x');

    const prefs = collectPrefs();
    expect(prefs['clio.density.v1']).toBe('verbose');
    expect(prefs['clio.locale.v1']).toBe('es');
    expect(prefs['clio.notif-prefs.v1']).toBe('{"turnCompletions":false}');
    expect(prefs['clio.backends.v1']).toBeUndefined();
    expect(prefs['other-app.key']).toBeUndefined();
  });

  it('builds a versioned envelope', () => {
    localStorage.setItem('clio.density.v1', 'summary');
    const env = buildEnvelope();
    expect(env.version).toBe(1);
    expect(env.app).toBe('clio-desktop');
    expect(typeof env.exportedAt).toBe('string');
    expect(env.prefs['clio.density.v1']).toBe('summary');
  });

  it('round-trips: export → wipe → import restores every value exactly', () => {
    localStorage.setItem('clio.density.v1', 'verbose');
    localStorage.setItem('clio.theme.preset.v1', 'high-contrast');
    localStorage.setItem(
      'clio.palette-frecency.v1',
      JSON.stringify({ doctor: { count: 3, lastUsed: 123 } }),
    );
    const exported = JSON.stringify(buildEnvelope());

    localStorage.clear();
    expect(localStorage.getItem('clio.density.v1')).toBeNull();

    const result = importSettings(exported);
    expect(result.applied).toBe(3);
    expect(result.skipped).toBe(0);
    expect(localStorage.getItem('clio.density.v1')).toBe('verbose');
    expect(localStorage.getItem('clio.theme.preset.v1')).toBe('high-contrast');
    expect(localStorage.getItem('clio.palette-frecency.v1')).toBe(
      JSON.stringify({ doctor: { count: 3, lastUsed: 123 } }),
    );
  });

  it('rejects non-JSON input with a readable error', () => {
    expect(() => importSettings('not json at all {')).toThrow(/valid JSON/i);
  });

  it('rejects JSON that is not a v1 envelope', () => {
    expect(() => importSettings('{"foo": "bar"}')).toThrow(/version 1/i);
    expect(() =>
      importSettings(JSON.stringify({ version: 2, prefs: {} })),
    ).toThrow(/version 1/i);
  });

  it('never applies credential keys from a tampered file', () => {
    const tampered = JSON.stringify({
      version: 1,
      exportedAt: 'x',
      app: 'clio-desktop',
      prefs: {
        'clio.density.v1': 'verbose',
        'clio.backends.v1': '{"backends":[{"bearerToken":"injected"}]}',
        'not-clio-key': 'whatever',
      },
    });
    const result = importSettings(tampered);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(2);
    expect(localStorage.getItem('clio.backends.v1')).toBeNull();
    expect(localStorage.getItem('not-clio-key')).toBeNull();
    expect(localStorage.getItem('clio.density.v1')).toBe('verbose');
  });
});
