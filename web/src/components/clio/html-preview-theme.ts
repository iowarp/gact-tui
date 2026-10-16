import { useEffect, useState } from 'react';

const TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'border',
  'input',
  'ring',
  'radius',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
  'destructive',
  'destructive-foreground',
  'info',
  'info-foreground',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'font-sans',
  'font-mono',
] as const;

export interface HtmlPreviewTheme {
  mode: 'light' | 'dark';
  variables: Record<string, string>;
}

/** Copy only CLIO's public presentation tokens into an isolated display document. */
export function readHtmlPreviewTheme(): HtmlPreviewTheme {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const variables: Record<string, string> = {};
  for (const token of TOKENS) {
    const value = style.getPropertyValue(`--${token}`).trim();
    if (value) variables[`--${token}`] = value;
  }
  variables['--font-sans'] ||=
    getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  variables['--font-mono'] ||= 'ui-monospace, monospace';
  variables['--clio-font-size'] = style.fontSize || '16px';
  return { mode: root.classList.contains('dark') ? 'dark' : 'light', variables };
}

/** Follow theme and interface-size changes without rebuilding interactive documents. */
export function useHtmlPreviewTheme(): HtmlPreviewTheme {
  const [theme, setTheme] = useState(readHtmlPreviewTheme);
  useEffect(() => {
    const update = () => {
      const next = readHtmlPreviewTheme();
      setTheme((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-clio-interface-size'],
    });
    update();
    return () => observer.disconnect();
  }, []);
  return theme;
}

/** Preserve the original SVG bytes; only its image display copy receives theme defaults. */
export function themedSvgBytes(bytes: Uint8Array, theme: HtmlPreviewTheme): Uint8Array {
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') return bytes;
  // An SVG image has no themed parent. Honor root inheritance as inheritance
  // from CLIO, rather than the browser's default black; keep explicit colors.
  const root = doc.documentElement;
  const inherit = /^(currentcolor|inherit|unset)$/iu;
  if (inherit.test(root.getAttribute('color')?.trim() ?? '')) {
    root.setAttribute('color', 'var(--foreground, currentColor)');
  }
  const inline = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  inline.setAttribute('style', root.getAttribute('style') ?? '');
  if (inherit.test(inline.style.getPropertyValue('color').trim())) {
    inline.style.setProperty(
      'color',
      'var(--foreground, currentColor)',
      inline.style.getPropertyPriority('color'),
    );
    root.setAttribute('style', inline.getAttribute('style')!);
  }
  // SVG images otherwise default to a tiny 300px intrinsic width, even with a large viewBox.
  const viewBox = doc.documentElement
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (
    !doc.documentElement.hasAttribute('width') &&
    !doc.documentElement.hasAttribute('height') &&
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    viewBox[2]! > 0 &&
    viewBox[3]! > 0
  ) {
    for (const [attribute, size] of [
      ['width', viewBox[2]],
      ['height', viewBox[3]],
    ] as const) {
      if (!doc.documentElement.hasAttribute(attribute))
        doc.documentElement.setAttribute(attribute, String(size));
    }
  }
  const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `${themeVariablesCss(theme)}
    :where(svg) { font-family: var(--font-sans); }
    :where(:root:not([color])) { color: var(--foreground, currentColor); }
    :where(:root:not([fill])) { fill: currentColor; }
  `;
  doc.documentElement.prepend(style);
  return new TextEncoder().encode(new XMLSerializer().serializeToString(doc));
}

/** Presentation defaults have lower precedence than authored styles. */
export function themeVariablesCss(theme: HtmlPreviewTheme): string {
  return `:root { color-scheme: ${theme.mode}; ${Object.entries(theme.variables)
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ')} }`;
}
