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
import { test } from 'node:test';

import { resolveBrandVocabulary } from '../scripts/gen-brand-backend.mjs';

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
