/**
 * Make h5web follow the host app's theme instead of the operating system's.
 *
 * h5web's dark mode is one `@media (prefers-color-scheme: dark)` block keyed
 * on `[data-allow-dark-mode]`. Inside an iframe that query follows the OS in
 * Chromium (WebKit follows the iframe's `color-scheme`), so it cannot be
 * driven from the host. Instead the viewer turns h5web's own switch off
 * (`disableDarkMode`) and installs a copy of those rules, scoped to
 * `:root[data-theme="dark"]`, read from the loaded stylesheet so h5web's
 * hashed class names are never hard-coded.
 */

import type { Hdf5Palette } from './protocol';

const MEDIA_RULE = 4;
const STYLE_RULE = 1;
const ALLOW_DARK = '[data-allow-dark-mode]';

export type Theme = 'light' | 'dark';

/** The dark-mode rules h5web declares, rewritten to apply under `data-theme="dark"`. */
export function hostDarkRules(sheets: Iterable<CSSStyleSheet>): string[] {
  const rules: string[] = [];
  for (const sheet of sheets) {
    let sheetRules: CSSRuleList;
    try {
      sheetRules = sheet.cssRules;
    } catch {
      continue; // Cross-origin sheets are unreadable; h5web's is same-origin.
    }
    for (const rule of Array.from(sheetRules)) {
      if (rule.type !== MEDIA_RULE) continue;
      const media = (rule as CSSMediaRule).media.mediaText.replace(/\s+/gu, '');
      if (!media.includes('prefers-color-scheme:dark')) continue;
      for (const inner of Array.from((rule as CSSMediaRule).cssRules)) {
        if (inner.type !== STYLE_RULE) continue;
        const style = inner as CSSStyleRule;
        if (!style.selectorText.includes(ALLOW_DARK)) continue;
        const selector = style.selectorText
          .split(',')
          .map((part) => `:root[data-theme="dark"] ${part.trim().replaceAll(ALLOW_DARK, '')}`)
          .join(', ');
        rules.push(`${selector} { ${style.style.cssText} }`);
      }
    }
  }
  return rules;
}

/** Install the scoped dark rules once, then set the theme on the document. */
export function applyTheme(doc: Document, theme: Theme): void {
  if (!doc.querySelector('style[data-host-dark-mode]')) {
    const element = doc.createElement('style');
    element.setAttribute('data-host-dark-mode', '');
    element.textContent = hostDarkRules(Array.from(doc.styleSheets)).join('\n');
    doc.head.append(element);
  }
  doc.documentElement.setAttribute('data-theme', theme);
  doc.documentElement.style.colorScheme = theme;
}

/** `#rrggbb` with each channel inverted. */
export function invertHex(color: string): string {
  const value = 0xffffff - Number.parseInt(color.slice(1), 16);
  return `#${value.toString(16).padStart(6, '0')}`;
}

/**
 * h5web's palette variables, set to the host's colors. h5web's dark mode
 * inverts its whole root with a CSS filter, so in dark each color is given
 * inverted and the filter turns it back into the host's. Charts draw on
 * canvases h5web inverts twice, so their line color stays as given.
 */
export function paletteRules(palette: Hdf5Palette, theme: Theme | undefined): string {
  const ink = theme === 'dark' ? invertHex : (color: string) => color;
  const background = ink(palette.background);
  const foreground = ink(palette.foreground);
  const muted = ink(palette.muted);
  const border = ink(palette.border);
  const hover = ink(palette.hover);
  const selected = ink(palette.selected);
  const accent = ink(palette.accent);
  const variables: Record<string, string> = {
    color: foreground,
    'background-color': background,
    '--primary': selected,
    '--primary-light': selected,
    '--primary-lighter': hover,
    '--primary-dark': border,
    '--primary-bg': background,
    '--primary-light-bg': background,
    '--primary-dark-bg': selected,
    '--secondary': accent,
    '--secondary-light': selected,
    '--secondary-lighter': hover,
    '--secondary-dark': accent,
    '--secondary-dark-15': border,
    '--secondary-darker': accent,
    '--secondary-bg': hover,
    '--secondary-light-bg': background,
    '--h5w-info--color': muted,
    '--h5w-toolbar-label--color': muted,
    '--h5w-matrix-cell--bgColorAlt': background,
    '--h5w-matrix-indexCell--bgColor': background,
    '--h5w-matrix-indexCell--bgColorAlt': background,
    '--h5w-line--color': palette.accent,
  };
  const declarations = Object.entries(variables)
    .map(([name, value]) => `${name}: ${value} !important;`)
    .join(' ');
  return [
    `html, body { background-color: ${palette.background}; }`,
    `[data-fullscreen-root] { ${declarations} }`,
    `[data-fullscreen-root] > [role='separator'],` +
      ` [data-fullscreen-root] > [role='separator']::before { background-color: ${border} !important; width: 1px; }`,
  ].join('\n');
}

/** Paint h5web with the host's palette, replacing any earlier one. */
export function applyPalette(doc: Document, palette: Hdf5Palette, theme: Theme | undefined): void {
  let element = doc.querySelector<HTMLStyleElement>('style[data-host-palette]');
  if (!element) {
    element = doc.createElement('style');
    element.setAttribute('data-host-palette', '');
    doc.head.append(element);
  }
  element.textContent = paletteRules(palette, theme);
}
