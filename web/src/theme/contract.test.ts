import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_TOKENS, THEMES } from './contract';

const css = readFileSync(resolve(process.cwd(), 'src/theme/themes.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//gu,
  '',
);

/** Each rule's selector and the custom properties it declares. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map(([, selector, body]) => ({
  selectors: selector!.split(',').map((part) => part.trim()),
  tokens: [...body!.matchAll(/--([a-z0-9-]+)\s*:/gu)].map((match) => match[1]!),
}));

function declared(...selectors: string[]): Set<string> {
  return new Set(
    rules
      .filter((rule) => rule.selectors.some((selector) => selectors.includes(selector)))
      .flatMap((rule) => rule.tokens),
  );
}

const variants = THEMES.flatMap((theme) => {
  const light = `:root[data-theme='${theme.id}']`;
  const dark = `${light}.dark`;
  if (theme.scheme !== 'system') return [{ name: theme.id, tokens: declared(light) }];
  return [
    { name: `${theme.id} light`, tokens: declared(light) },
    { name: `${theme.id} dark`, tokens: declared(light, dark) },
  ];
});

describe('theme contract', () => {
  it.each(variants)('$name defines every token in the contract and nothing else', ({ tokens }) => {
    expect([...tokens].sort()).toEqual([...THEME_TOKENS].sort());
  });

  it('gives Light the bare :root so the page has values before the boot script runs', () => {
    expect(declared(':root')).toEqual(declared(":root[data-theme='light']"));
  });

  // Destructive menu rows are 12.5px text: they need 4.5:1 at rest and when focused.
  // A focused row tints its background with destructive at 10% (light) or 20% (dark),
  // and dark switches its text to destructive-foreground (see ui/dropdown-menu.tsx).
  it.each([
    { theme: 'light', focusTint: 0.1, focusText: 'destructive' },
    { theme: 'dark', focusTint: 0.2, focusText: 'destructive-foreground' },
  ])('keeps $theme destructive menu text at 4.5:1', ({ theme, focusTint, focusText }) => {
    const value = (token: string) => hex(tokenValue(`:root[data-theme='${theme}']`, token));
    const destructive = value('destructive');
    for (const surface of ['popover', 'menu-highlight']) {
      expect(contrast(destructive, value(surface))).toBeGreaterThanOrEqual(4.5);
    }
    const focused = mix(destructive, value('popover'), focusTint);
    expect(contrast(value(focusText), focused)).toBeGreaterThanOrEqual(4.5);
  });
});

function tokenValue(selector: string, token: string): string {
  const body = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].find(([, selectors]) =>
    selectors!.split(',').some((part) => part.trim() === selector),
  )?.[2];
  const value = body?.match(new RegExp(`--${token}\\s*:\\s*([^;]+);`, 'u'))?.[1]?.trim();
  if (!value) throw new Error(`${selector} does not declare --${token}`);
  return value;
}

function hex(value: string): number[] {
  const match = /^#([0-9a-f]{6})$/iu.exec(value);
  if (!match) throw new Error(`expected a #rrggbb colour, got ${value}`);
  return [0, 2, 4].map((offset) => parseInt(match[1]!.slice(offset, offset + 2), 16) / 255);
}

function mix(top: number[], bottom: number[], alpha: number): number[] {
  return top.map((channel, index) => channel * alpha + bottom[index]! * (1 - alpha));
}

function contrast(a: number[], b: number[]): number {
  const luminance = (rgb: number[]) => {
    const [r, g, bl] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}
