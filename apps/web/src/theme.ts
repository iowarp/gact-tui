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
 *
 * Brand layer: the selected brand profile (build-time, see vite-plugin-brand)
 * supplies `themeTokens` (e.g. the accent). These are applied as a BASE layer
 * (no !important) beneath the user-override layer, so brand sets the default
 * accent while user theme edits still win.
 */

import { brand } from '@brand';
import { LIGHT_THEME_TOKENS, THEME_PRESETS } from './ThemePresets.js';

export { LIGHT_THEME_TOKENS, THEME_PRESETS } from './ThemePresets.js';

export const THEME_TOKENS_KEY = 'clio.theme.tokens.v1';
export const THEME_PRESET_KEY = 'clio.theme.preset.v1';
export const THEME_MODE_KEY = 'clio.theme.mode.v1';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type ThemePresetMode = Exclude<ThemeMode, 'auto'>;

export const DEFAULT_THEME_MODE: ThemeMode = 'auto';
export const DEFAULT_DARK_PRESET_ID = 'dim';
export const DEFAULT_LIGHT_PRESET_ID = 'light';

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
  if (typeof localStorage === 'undefined') return DEFAULT_THEME_MODE;
  const raw = localStorage.getItem(THEME_MODE_KEY);
  return raw === 'dark' || raw === 'light' || raw === 'auto' ? raw : DEFAULT_THEME_MODE;
}

/** OS preference → preset id (auto mode). */
function osPresetId(): string {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return DEFAULT_DARK_PRESET_ID;
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? DEFAULT_LIGHT_PRESET_ID
    : DEFAULT_DARK_PRESET_ID;
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
    applyPresetTokens(DEFAULT_DARK_PRESET_ID);
    return;
  }
  if (mode === 'light') {
    applyPresetTokens(DEFAULT_LIGHT_PRESET_ID);
    return;
  }
  // auto — apply per current OS scheme + follow changes live.
  applyPresetTokens(osPresetId());
  if (q) {
    autoListener = () => applyPresetTokens(osPresetId());
    q.addEventListener('change', autoListener);
  }
}

/**
 * Apply the build-time brand's theme tokens as a base layer (no !important),
 * so the brand sets the default accent / palette tweaks while the user
 * override layer (`clio-theme-override`, which DOES use !important) wins.
 */
export function applyBrandTokens() {
  if (typeof document === 'undefined') return;
  const tokens = brand.themeTokens ?? {};
  let style = document.getElementById('gact-brand-tokens');
  if (!style) {
    style = document.createElement('style');
    style.id = 'gact-brand-tokens';
    // Append AFTER the bundled design-system stylesheet so the brand accent
    // wins over the design default. The user-override <style>
    // (`clio-theme-override`) is appended later AND uses !important, so manual
    // theme edits still beat the brand base layer.
    document.head.appendChild(style);
  }
  const css = Object.entries(tokens)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  style.textContent = css ? `:root {\n${css}\n}\n` : '';
}

/** Module-load init: re-establish persisted tokens + the auto listener. */
export function initTheme() {
  if (typeof document === 'undefined') return;
  applyBrandTokens();
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
    applyThemeTokens(Object.keys(stored).length > 0 ? stored : LIGHT_THEME_TOKENS);
    return;
  }
  // Dark: re-apply stored edits, or the dim preset when only the mode flag
  // exists.
  const stored = loadThemeTokens();
  applyThemeTokens(
    Object.keys(stored).length > 0 ? stored : (THEME_PRESETS[DEFAULT_DARK_PRESET_ID]?.tokens ?? {}),
  );
}

initTheme();
