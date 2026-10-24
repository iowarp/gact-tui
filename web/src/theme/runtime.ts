import { useSyncExternalStore } from 'react';
import type { ColorToken, FontToken } from './contract';

/**
 * Theme tokens for renderers that cannot read CSS variables: canvas, WebGL,
 * Vega and Mermaid. They read the active theme's resolved values here and
 * redraw when `useThemeKey()` changes.
 */

/** Identifies the applied theme and variant, e.g. `notebook:dark`. */
export function themeKey(root: HTMLElement = document.documentElement): string {
  return `${root.dataset.theme ?? 'light'}:${root.classList.contains('dark') ? 'dark' : 'light'}`;
}

export function isDarkTheme(root: HTMLElement = document.documentElement): boolean {
  return root.classList.contains('dark');
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  });
  return () => observer.disconnect();
}

/** Re-renders when the theme or its variant changes. */
export function useThemeKey(): string {
  return useSyncExternalStore(
    subscribe,
    () => themeKey(),
    () => 'light:light',
  );
}

const cache = new Map<string, string>();
let probeContext: CanvasRenderingContext2D | null | undefined;

function srgbContext(): CanvasRenderingContext2D | null {
  if (probeContext !== undefined) return probeContext;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    probeContext = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    probeContext = null;
  }
  return probeContext;
}

const hex = (value: number) => value.toString(16).padStart(2, '0');

/** Any CSS color, including oklch() and color-mix(), as `#rrggbb` or `rgba()` in sRGB. */
export function toSrgb(color: string): string {
  const context = srgbContext();
  if (!context) return color;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
  return a === 255
    ? `#${hex(r)}${hex(g)}${hex(b)}`
    : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/**
 * A CSS color expression over theme tokens, such as
 * `color-mix(in oklab, var(--primary) 18%, transparent)`, resolved in the
 * active theme to sRGB. Unresolvable expressions (no stylesheet, as in unit
 * tests) come back unchanged.
 */
export function resolveThemeColor(expression: string): string {
  const key = `${themeKey()}|${expression}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const probe = document.createElement('span');
  probe.style.color = expression;
  probe.style.display = 'none';
  document.documentElement.append(probe);
  let computed = getComputedStyle(probe).color;
  probe.remove();
  // Engines without var() resolution in computed colors (jsdom) still expose the token itself.
  const token = /^var\((--[\w-]+)\)$/u.exec(expression)?.[1];
  if ((!computed || computed.includes('var(')) && token) {
    computed = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  }
  if (!computed || computed.includes('var(')) return expression;
  const value = toSrgb(computed);
  cache.set(key, value);
  return value;
}

/** The active theme's value for a color token, in sRGB. */
export function readThemeColor(token: ColorToken): string {
  return resolveThemeColor(`var(--${token})`);
}

/** The active theme's font stack for a typeface token. */
export function readThemeFont(token: FontToken): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
}
