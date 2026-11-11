// Parity guard: gen-brand-backend.mjs's resolveBrandVocabulary() duplicates
// web/vite-plugin-brand.ts's loadBrand() vocabulary defaulting ON PURPOSE —
// a .mjs script cannot import the .ts plugin without a build step (see both
// files' module doc comments). Node's test runner cannot import a .ts file
// either without a build step, so this test extracts a small local,
// pure-JS mirror of ONLY the vocabulary rule loadBrand applies (not the
// whole plugin) and asserts the generator's real output equals it for the
// same fixture brand.json, for both the neutral defaults and an explicit
// override of every field. A drift between the two would show up here
// before it reaches a shipped build.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  resolveBrandVocabulary,
  resolvePortConfig,
  resolveTrayTemplate,
} from '../scripts/gen-brand-backend.mjs';

/**
 * Mirrors ONLY the vocabulary defaulting rules from
 * web/vite-plugin-brand.ts's loadBrand(): productName -> `${name} Desktop`,
 * agentName -> name. (workspaceNoun has no native/generator consumer, so it
 * is out of scope for this parity guard.)
 */
function pluginVocabularyResolution(raw) {
  const name = raw.name.trim();
  return {
    productName: raw.productName?.trim() || `${name} Desktop`,
    agentName: raw.agentName?.trim() || name,
  };
}

test('the generator defaults productName/agentName identically to the plugin, for a brand with no overrides', () => {
  const raw = { name: 'Acme' };

  const generated = resolveBrandVocabulary(raw, 'acme');
  const expected = pluginVocabularyResolution(raw);

  assert.equal(generated.productName, expected.productName);
  assert.equal(generated.agentName, expected.agentName);
  assert.equal(generated.productName, 'Acme Desktop');
  assert.equal(generated.agentName, 'Acme');
});

test('the generator honors explicit productName/agentName overrides identically to the plugin', () => {
  const raw = { name: 'Acme', productName: 'Acme Labs', agentName: 'Ace' };

  const generated = resolveBrandVocabulary(raw, 'acme');
  const expected = pluginVocabularyResolution(raw);

  assert.equal(generated.productName, expected.productName);
  assert.equal(generated.agentName, expected.agentName);
  assert.equal(generated.productName, 'Acme Labs');
  assert.equal(generated.agentName, 'Ace');
});

test('the generator falls back from a whitespace-only override the same way the plugin does', () => {
  const raw = { name: 'Acme', productName: '   ', agentName: '   ' };

  const generated = resolveBrandVocabulary(raw, 'acme');
  const expected = pluginVocabularyResolution(raw);

  assert.equal(generated.productName, expected.productName);
  assert.equal(generated.agentName, expected.agentName);
});

test('a brand with no "name" falls back to the profile id, matching the generator CLI contract', () => {
  const generated = resolveBrandVocabulary({ productName: 'Headless Desktop' }, 'acme');

  assert.equal(generated.productName, 'Headless Desktop');
  assert.equal(generated.agentName, 'acme');
});

test('a brand port config names the agent config key, its env override and the default', () => {
  assert.deepEqual(
    resolvePortConfig({
      sidecarName: 'clio-agent',
      portConfig: {
        key: 'gact.port',
        env: 'CLIO_PORT',
        default: 17800,
        file: 'config.yaml',
        resolver: 'python -m clio_agent.server_port',
      },
      attachPort: 17800,
      attachPortEnv: 'CLIO_PORT',
    }),
    {
      key: 'gact.port',
      env: 'CLIO_PORT',
      default: 17800,
      product: 'clio-agent',
      resolver: 'clio_agent.server_port',
    },
  );
});

test('a brand from before portConfig keeps its attach port and env override', () => {
  assert.deepEqual(resolvePortConfig({ attachPort: 18000, attachPortEnv: 'CLIO_PORT' }), {
    key: null,
    env: 'CLIO_PORT',
    default: 18000,
    product: null,
    resolver: null,
  });
});

test('a brand with no backend has no port override and the shared default', () => {
  assert.deepEqual(resolvePortConfig(undefined), {
    key: null,
    env: null,
    default: 17800,
    product: null,
    resolver: null,
  });
  assert.throws(() => resolvePortConfig({ portConfig: { default: 70000 } }), /TCP port/);
});

test('the tray template comes only from the selected brand', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brand-tray-'));
  try {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    writeFileSync(join(dir, 'tray.png'), png);
    writeFileSync(join(dir, 'logo.svg'), '<svg/>');
    assert.deepEqual(resolveTrayTemplate({ trayTemplate: 'tray.png' }, dir), png);
    assert.equal(resolveTrayTemplate({}, dir).length, 0, 'no template: the tray uses the app icon');
    assert.throws(() => resolveTrayTemplate({ trayTemplate: 'logo.svg' }, dir), /not a PNG/);
    assert.throws(() => resolveTrayTemplate({ trayTemplate: '' }, dir), /PNG path/);
    assert.throws(() => resolveTrayTemplate({ trayTemplate: 'missing.png' }, dir), /ENOENT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the neutral brand ships a template and the generated copy matches it', () => {
  const brandDir = fileURLToPath(new URL('../../branding/gact/', import.meta.url));
  const raw = JSON.parse(readFileSync(join(brandDir, 'brand.json'), 'utf8'));
  const generated = fileURLToPath(new URL('../src-tauri/gen/tray-template.png', import.meta.url));
  assert.deepEqual(readFileSync(generated), resolveTrayTemplate(raw, brandDir));
});
