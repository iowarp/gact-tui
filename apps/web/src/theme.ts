/**
 * CLIO Desktop theming (1.0 item 1 — light theme + auto mode).
 *
 * Three cooperating override layers, all riding one persisted token store:
 *  - Theme mode (dark / light / auto) — the primary switch. `light` applies
 *    the Light preset's tokens; `auto` follows the OS prefers-color-scheme
 *    live.
 *  - Presets (Default / Light / High contrast / Dim) — one-click token sets.
 *  - Per-color editor — fine-tuning written into the same store.
 *
 * The design system (apps/design, read-only) defines the dark default; the
 * light palette lives HERE at the web layer as a token override set, so the
 * design system is never forked.
 */

export const THEME_TOKENS_KEY = 'clio.theme.tokens.v1';
export const THEME_PRESET_KEY = 'clio.theme.preset.v1';
export const THEME_MODE_KEY = 'clio.theme.mode.v1';

export type ThemeMode = 'dark' | 'light' | 'auto';

/**
 * Full light palette — every color token the design system defines, plus the
 * syntax-highlight and diff-tint tokens that exist only as overrides (their
 * dark values are CSS fallbacks in the stylesheets).
 */
export const LIGHT_THEME_TOKENS: Record<string, string> = {
  '--color-bg': '#f4f6fa',
  '--color-surface': '#ffffff',
  '--color-surface-alt': '#e8edf4',
  '--color-heading': '#101b30',
  '--color-text': '#33506b',
  '--color-muted': '#5e7286',
  '--color-border': '#9eb1c7',
  '--color-border-30': 'rgba(78, 110, 144, 0.30)',
  '--color-border-60': 'rgba(78, 110, 144, 0.60)',
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
 * `applyThemeTokens` pipe as the per-color editor, so presets and manual
 * tweaks share persistence and reset behavior.
 */
export const THEME_PRESETS: Record<
  string,
  { label: string; tokens: Record<string, string> }
> = {
  default: {
    label: 'Default',
    tokens: {},
  },
  light: {
    label: 'Light',
    tokens: LIGHT_THEME_TOKENS,
  },
  'high-contrast': {
    label: 'High contrast',
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

export function loadThemeTokens(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(THEME_TOKENS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch {
    /* ignore */
  }
  return {};
}

export function applyThemeTokens(tokens: Record<string, string>) {
  if (typeof document === 'undefined') return;
  let style = document.getElementById('clio-theme-override');
  if (!style) {
    style = document.createElement('style');
    style.id = 'clio-theme-override';
    document.head.appendChild(style);
  }
  const css = Object.entries(tokens)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `  ${k}: ${v} !important;`)
    .join('\n');
  style.textContent = css ? `:root {\n${css}\n}\n` : '';
}

export function loadThemeMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'dark';
  const raw = localStorage.getItem(THEME_MODE_KEY);
  return raw === 'light' || raw === 'auto' ? raw : 'dark';
}

/** OS preference → preset id (auto mode). */
function osPresetId(): string {
  if (typeof window === 'undefined' || !window.matchMedia) return 'default';
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'default';
}

/** Applies a preset's tokens and persists them through the shared store. */
export function applyPresetTokens(presetId: string) {
  const preset = THEME_PRESETS[presetId];
  if (!preset) return;
  try {
    localStorage.setItem(THEME_PRESET_KEY, presetId);
    if (Object.keys(preset.tokens).length > 0) {
      localStorage.setItem(THEME_TOKENS_KEY, JSON.stringify(preset.tokens));
    } else {
      localStorage.removeItem(THEME_TOKENS_KEY);
    }
  } catch {
    /* quota — ignore */
  }
  applyThemeTokens(preset.tokens);
}

let autoListener: (() => void) | null = null;

function autoQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia('(prefers-color-scheme: light)');
}

/**
 * Switch the theme mode. `dark` and `light` apply their preset; `auto`
 * applies per the current OS scheme and follows changes live.
 */
export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
  // Tear down any previous auto listener.
  const q = autoQuery();
  if (autoListener && q) {
    q.removeEventListener('change', autoListener);
    autoListener = null;
  }
  if (mode === 'dark') {
    applyPresetTokens('default');
    return;
  }
  if (mode === 'light') {
    applyPresetTokens('light');
    return;
  }
  // auto — apply per current OS scheme + follow changes live.
  applyPresetTokens(osPresetId());
  if (q) {
    autoListener = () => applyPresetTokens(osPresetId());
    q.addEventListener('change', autoListener);
  }
}

/** Module-load init: re-establish persisted tokens + the auto listener. */
export function initTheme() {
  if (typeof document === 'undefined') return;
  const mode = loadThemeMode();
  if (mode === 'auto') {
    setThemeMode('auto');
    return;
  }
  if (mode === 'light') {
    // Re-apply light, preserving any manual token edits layered on top.
    // Falling back to the full light palette also makes a bare
    // `clio.theme.mode.v1 = light` flag sufficient (e.g. test seeding).
    const stored = loadThemeTokens();
    applyThemeTokens(
      Object.keys(stored).length > 0 ? stored : LIGHT_THEME_TOKENS,
    );
    return;
  }
  // Dark: tokens were persisted by the last preset/editor write — re-apply.
  applyThemeTokens(loadThemeTokens());
}

initTheme();
