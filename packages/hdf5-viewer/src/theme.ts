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
