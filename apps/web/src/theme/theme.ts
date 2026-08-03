/**
 * Theme application — the prototype's `applyTheme()` semantics, typed.
 *
 * Three presets (dim/dark/light) selected by a `data-theme` attribute on the
 * root element, plus two orthogonal knobs the prototype exposes in Appearance:
 * a prose font stack and a global type-scale multiplier (`--ts`).
 *
 * Brand `themeTokens` are merged LAST so an embedding brand can override any
 * token without forking this file.
 */
import { brand } from '@brand';

export type ThemePreset = 'dim' | 'dark' | 'light';

export type ProseFont = 'inter' | 'source' | 'literata' | 'atkinson' | 'dyslexic';

/** Prose stacks, transcribed from the prototype's `stacks` map. */
export const PROSE_STACKS: Record<ProseFont, string> = {
  inter: "'Inter',system-ui,sans-serif",
  source: "'Source Sans 3','Inter',system-ui,sans-serif",
  literata: "'Literata',Georgia,serif",
  atkinson: "'Atkinson Hyperlegible','Inter',system-ui,sans-serif",
  dyslexic: "'OpenDyslexic','Atkinson Hyperlegible',system-ui,sans-serif",
};

export interface Appearance {
  theme: ThemePreset;
  font: ProseFont;
  /** Type-scale multiplier; the prototype's `--ts`. */
  scale: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
  // The prototype's own default branch is DIM (dark is an explicit opt-in).
  theme: 'dim',
  font: 'inter',
  scale: 1,
};

const STORAGE_KEY = 'clio.appearance.v3';

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      theme: isPreset(parsed.theme) ? parsed.theme : DEFAULT_APPEARANCE.theme,
      font: isProseFont(parsed.font) ? parsed.font : DEFAULT_APPEARANCE.font,
      scale: typeof parsed.scale === 'number' && parsed.scale > 0 ? parsed.scale : 1,
    };
  } catch {
    // Unreadable or corrupt preference — fall back to the default appearance.
    // Deliberately silent: this is user preference, not system state, and the
    // default is a correct outcome rather than a degraded one.
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // Storage unavailable (private mode, quota). The in-memory appearance
    // still applies for this session.
  }
}

/** Apply an appearance to the document root. Idempotent. */
export function applyAppearance(appearance: Appearance, root: HTMLElement): void {
  root.setAttribute('data-theme', appearance.theme);
  root.style.setProperty('--f-prose', PROSE_STACKS[appearance.font]);
  root.style.setProperty('--ts', String(appearance.scale));

  // Brand overrides win over the preset, so a brand can restyle without a fork.
  for (const [token, value] of Object.entries(brand.themeTokens)) {
    root.style.setProperty(token, value);
  }
}

function isPreset(value: unknown): value is ThemePreset {
  return value === 'dim' || value === 'dark' || value === 'light';
}

function isProseFont(value: unknown): value is ProseFont {
  return typeof value === 'string' && value in PROSE_STACKS;
}
