/**
 * Static theme token sets.
 *
 * The runtime theme module owns persistence, DOM style tags, and auto-mode
 * listeners. This file is deliberately data-only so palette edits stay
 * reviewable and do not mix with side effects.
 */

/**
 * Full light palette — every color token the design system defines, plus the
 * syntax-highlight and diff-tint tokens that exist only as overrides (their
 * dark values are CSS fallbacks in the stylesheets).
 */
export const LIGHT_THEME_TOKENS: Record<string, string> = {
  '--color-bg': '#f7f9fc',
  '--color-surface': '#ffffff',
  '--color-surface-alt': '#eef3f8',
  '--color-heading': '#101b30',
  '--color-text': '#1f334a',
  '--color-muted': '#465b72',
  '--color-border': '#8ca3bd',
  '--color-border-30': 'rgba(70, 91, 114, 0.30)',
  '--color-border-60': 'rgba(70, 91, 114, 0.60)',
  '--color-glow-cyan': 'rgba(6, 122, 135, 0.30)',
  '--color-accent': '#c75f14',
  '--color-accent-cyan': '#067a87',
  '--color-accent-cyan-10': 'rgba(6, 122, 135, 0.10)',
  '--color-accent-cyan-20': 'rgba(6, 122, 135, 0.20)',
  '--color-accent-cyan-30': 'rgba(6, 122, 135, 0.30)',
  '--color-accent-warm-10': 'rgba(199, 95, 20, 0.10)',
  '--color-accent-warm-20': 'rgba(199, 95, 20, 0.20)',
  '--color-success': '#067647',
  '--color-warning': '#a16207',
  '--color-error': '#bb2525',
  '--color-hljs-string': '#15803d',
  '--color-hljs-number': '#a16207',
  '--color-diff-add-bg': 'rgba(6, 118, 71, 0.10)',
  '--color-diff-del-bg': 'rgba(187, 37, 37, 0.10)',
  // Elevation: the dark default's pure-black drop is far too heavy on a
  // white canvas. One overlay-shadow token (DESIGN.md) travels with the
  // theme rather than being re-specified per component.
  '--shadow-overlay': '0 18px 48px -20px rgba(20, 36, 64, 0.35)',
};

/**
 * Theme presets. Each is a token-override set applied through the same
 * runtime pipe as the per-color editor, so presets and manual tweaks share
 * persistence and reset behavior.
 */
export const THEME_PRESETS: Record<
  string,
  { label: string; mode: 'dark' | 'light'; tokens: Record<string, string> }
> = {
  default: {
    label: 'Default',
    mode: 'dark',
    tokens: {},
  },
  light: {
    label: 'Light',
    mode: 'light',
    tokens: LIGHT_THEME_TOKENS,
  },
  'high-contrast': {
    label: 'High contrast',
    mode: 'dark',
    tokens: {
      '--color-bg': '#000000',
      '--color-surface': '#0a0a0a',
      '--color-surface-alt': '#161616',
      '--color-text': '#ffffff',
      '--color-heading': '#ffffff',
      '--color-muted': '#d4d4d4',
      '--color-border-30': '#777777',
      '--color-border-60': '#aaaaaa',
      '--color-border': '#ffffff',
      '--color-accent': '#ffb366',
      '--color-accent-cyan': '#7ae7ff',
      '--color-success': '#7dffc4',
      '--color-warning': '#ffe066',
      '--color-error': '#ff9090',
    },
  },
  dim: {
    label: 'Dim',
    mode: 'dark',
    tokens: {
      '--color-bg': '#101216',
      '--color-surface': '#16181d',
      '--color-surface-alt': '#1c1f25',
      '--color-text': '#a8adb8',
      '--color-heading': '#c5cad3',
      '--color-muted': '#6b7280',
      '--color-accent': '#c4682a',
      '--color-accent-cyan': '#0aa6ad',
      '--shadow-overlay': '0 24px 64px -18px rgba(0, 0, 0, 0.6)',
    },
  },
};
