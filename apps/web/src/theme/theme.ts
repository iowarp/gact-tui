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

/** Display labels for the prose-font buttons — the prototype shows the full
 * family name ("Source Sans 3", "OpenDyslexic"), not the internal union key
 * used to look up the stack. Rendered in the font's own face (via the stack
 * above) so each button previews its family, matching the prototype. */
export const PROSE_FONT_LABELS: Record<ProseFont, string> = {
  inter: 'Inter',
  source: 'Source Sans 3',
  literata: 'Literata',
  atkinson: 'Atkinson Hyperlegible',
  dyslexic: 'OpenDyslexic',
};

/** Discrete text-size steps — the prototype's S/M/L/XL buttons replace what
 * was a continuous range slider (no such control exists in the ground
 * truth). Values span the same 0.85–1.4 envelope the old slider allowed. */
export type TextSize = 'S' | 'M' | 'L' | 'XL';

export const TEXT_SIZE_SCALE: Record<TextSize, number> = {
  S: 0.9,
  M: 1,
  L: 1.15,
  XL: 1.3,
};

/** Diff-preview line count — "Change lines shown inline in transcript diffs
 * before the pop-up takes over." A stored preference; no consumer reads it
 * yet (the inline diff preview itself is untouched by this pass). */
export type DiffPreviewLines = 3 | 5 | 8;

/** "Auto keeps tool widgets (mcp-ui) as compact chips and expands model
 * widgets (a2ui). Always expand renders both inline." Stored preference;
 * no consumer reads it yet. */
export type UiWidgetsMode = 'auto' | 'always';

export interface Appearance {
  theme: ThemePreset;
  font: ProseFont;
  /** Type-scale multiplier; the prototype's `--ts`. */
  scale: number;
  diffPreviewLines: DiffPreviewLines;
  uiWidgets: UiWidgetsMode;
  /** IETF tag. Only `en-US` is offered — no i18n catalog exists to switch to. */
  locale: string;
}

export const DEFAULT_APPEARANCE: Appearance = {
  // The prototype's own default branch is DIM (dark is an explicit opt-in).
  theme: 'dim',
  font: 'inter',
  scale: TEXT_SIZE_SCALE.M,
  diffPreviewLines: 3,
  uiWidgets: 'auto',
  locale: 'en-US',
};

const STORAGE_KEY = 'clio.appearance.v3';

function isDiffPreviewLines(value: unknown): value is DiffPreviewLines {
  return value === 3 || value === 5 || value === 8;
}

function isUiWidgetsMode(value: unknown): value is UiWidgetsMode {
  return value === 'auto' || value === 'always';
}

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      theme: isPreset(parsed.theme) ? parsed.theme : DEFAULT_APPEARANCE.theme,
      font: isProseFont(parsed.font) ? parsed.font : DEFAULT_APPEARANCE.font,
      scale: typeof parsed.scale === 'number' && parsed.scale > 0 ? parsed.scale : 1,
      diffPreviewLines: isDiffPreviewLines(parsed.diffPreviewLines)
        ? parsed.diffPreviewLines
        : DEFAULT_APPEARANCE.diffPreviewLines,
      uiWidgets: isUiWidgetsMode(parsed.uiWidgets) ? parsed.uiWidgets : DEFAULT_APPEARANCE.uiWidgets,
      locale: typeof parsed.locale === 'string' && parsed.locale ? parsed.locale : DEFAULT_APPEARANCE.locale,
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
