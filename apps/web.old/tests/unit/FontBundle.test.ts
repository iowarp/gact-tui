import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const webRoot = resolve(__dirname, '..', '..');
const repoAppsRoot = resolve(webRoot, '..');

describe('web font bundle contract', () => {
  test('does not reference the decorative display font from the app token path', () => {
    const designTokens = readFileSync(
      resolve(repoAppsRoot, 'design', 'colors_and_type.css'),
      'utf8',
    );
    const webTokens = readFileSync(resolve(webRoot, 'src', 'styles', 'index.css'), 'utf8');

    expect(designTokens).not.toMatch(/Oxanium/i);
    expect(webTokens).not.toMatch(/Oxanium/i);
  });
});
