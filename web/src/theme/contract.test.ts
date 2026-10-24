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
});
