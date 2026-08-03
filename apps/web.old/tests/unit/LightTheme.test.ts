/**
 * 1.0 item 1 — Light theme + auto mode.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIGHT_THEME_TOKENS,
  THEME_MODE_KEY,
  THEME_PRESETS,
  THEME_TOKENS_KEY,
  initTheme,
  setThemeMode,
} from '../../src/theme.js';

/** Every color token the (read-only) design system defines — the light
 * palette must override all of them or light mode would leak dark colors. */
const DESIGN_SYSTEM_COLOR_TOKENS = [
  '--color-bg',
  '--color-surface',
  '--color-surface-alt',
  '--color-heading',
  '--color-text',
  '--color-muted',
  '--color-border',
  '--color-border-30',
  '--color-border-60',
  '--color-glow-cyan',
  '--color-accent',
  '--color-accent-cyan',
  '--color-accent-cyan-10',
  '--color-accent-cyan-20',
  '--color-accent-cyan-30',
  '--color-accent-warm-10',
  '--color-accent-warm-20',
  '--color-success',
  '--color-warning',
  '--color-error',
];

function overrideCss(): string {
  return document.getElementById('clio-theme-override')?.textContent ?? '';
}

/** jsdom has no matchMedia — install a controllable stub. */
function stubMatchMedia(prefersLight: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: prefersLight,
    media: '(prefers-color-scheme: light)',
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal('matchMedia', () => mql);
  return {
    flip(next: boolean) {
      mql.matches = next;
      for (const cb of listeners) cb();
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  document.getElementById('clio-theme-override')?.remove();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Light theme (1.0 item 1)', () => {
  it('light palette overrides every design-system color token', () => {
    for (const token of DESIGN_SYSTEM_COLOR_TOKENS) {
      expect(LIGHT_THEME_TOKENS[token], `missing ${token}`).toBeTruthy();
    }
    // Plus the override-only tokens (code + diff tints).
    expect(LIGHT_THEME_TOKENS['--color-hljs-string']).toBeTruthy();
    expect(LIGHT_THEME_TOKENS['--color-hljs-number']).toBeTruthy();
    expect(LIGHT_THEME_TOKENS['--color-diff-add-bg']).toBeTruthy();
    expect(LIGHT_THEME_TOKENS['--color-diff-del-bg']).toBeTruthy();
  });

  it('light is registered as a preset', () => {
    expect(THEME_PRESETS['light']).toBeDefined();
    expect(THEME_PRESETS['light']!.tokens).toEqual(LIGHT_THEME_TOKENS);
  });

  it('setThemeMode(light) applies the light bg and persists', () => {
    setThemeMode('light');
    expect(overrideCss()).toContain('--color-bg: #f7f9fc');
    expect(localStorage.getItem(THEME_MODE_KEY)).toBe('light');
    expect(localStorage.getItem(THEME_TOKENS_KEY)).toContain('#f7f9fc');
  });

  it('setThemeMode(dark) applies the dim preset and persists', () => {
    setThemeMode('light');
    expect(overrideCss()).not.toBe('');
    setThemeMode('dark');
    expect(overrideCss()).toContain('--color-bg: #101216');
    expect(localStorage.getItem(THEME_MODE_KEY)).toBe('dark');
    expect(localStorage.getItem(THEME_TOKENS_KEY)).toContain('#101216');
  });

  it('auto mode follows the OS scheme and switches live', () => {
    const os = stubMatchMedia(true); // OS prefers light
    setThemeMode('auto');
    expect(overrideCss()).toContain('--color-bg: #f7f9fc');
    // OS flips to dark and applies the dim preset without any further calls.
    os.flip(false);
    expect(overrideCss()).toContain('--color-bg: #101216');
    // …and back to light.
    os.flip(true);
    expect(overrideCss()).toContain('--color-bg: #f7f9fc');
  });

  it('initTheme re-applies light mode from a bare mode flag', () => {
    localStorage.setItem(THEME_MODE_KEY, 'light');
    initTheme();
    expect(overrideCss()).toContain('--color-bg: #f7f9fc');
  });

  it('initTheme preserves manual token edits layered on light', () => {
    localStorage.setItem(THEME_MODE_KEY, 'light');
    localStorage.setItem(
      THEME_TOKENS_KEY,
      JSON.stringify({ ...LIGHT_THEME_TOKENS, '--color-accent': '#ff0000' }),
    );
    initTheme();
    expect(overrideCss()).toContain('--color-accent: #ff0000');
    expect(overrideCss()).toContain('--color-bg: #f7f9fc');
  });
});
