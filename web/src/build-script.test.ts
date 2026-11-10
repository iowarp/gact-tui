import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageJson = fileURLToPath(new URL('../package.json', import.meta.url));
const { scripts } = JSON.parse(readFileSync(packageJson, 'utf8')) as {
  scripts: Record<string, string>;
};

// The type check emits nothing and needs a >2 GB heap; `pnpm typecheck` gates
// it in CI. Running it inside `build` makes release bundles fail on 7 GB runners.
describe('web build script', () => {
  it('bundles without repeating the type check', () => {
    expect(scripts['build']).toBe('pnpm run build:bundle');
    expect(scripts['build:bundle']).not.toMatch(/\btsc\b/u);
    expect(scripts['typecheck']).toMatch(/\btsc -b\b/u);
  });
});
