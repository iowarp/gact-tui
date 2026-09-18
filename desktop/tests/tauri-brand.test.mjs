// Verifies the branded Tauri runner resolves overlays from an EXPLICIT config
// file rather than depending on a developer's local, gitignored
// `brand.config.local.json`. Every assertion here either supplies its own
// temporary config file or explicitly suspends the real one, so this test
// passes identically on a clean clone (CI) and on a workstation that has a
// local brand override checked out (e.g. clio-agent's own working copy).
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { mergeConfig, resolveNativeBrandOverlay } from '../scripts/run-tauri-branded.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const desktopRoot = resolve(__dirname, '..');

test('an explicit config resolves a temporary branding root, independent of any local override', () => {
  const tmpRoot = mkdtempSync(resolve(tmpdir(), 'gact-tui-brand-'));
  try {
    const brandingRoot = resolve(tmpRoot, 'branding');
    const profileDir = resolve(brandingRoot, 'acme');
    mkdirSync(profileDir, { recursive: true });

    // Minimal brand.json: copy the fields the tracked gact profile declares,
    // so the fixture matches the real shape rather than an invented one.
    const gactBrand = JSON.parse(
      readFileSync(resolve(repoRoot, 'branding', 'gact', 'brand.json'), 'utf8'),
    );
    const acmeBrand = {
      ...gactBrand,
      name: 'Acme Desktop',
      wordmark: 'Acme',
    };
    writeFileSync(resolve(profileDir, 'brand.json'), `${JSON.stringify(acmeBrand, null, 2)}\n`);

    const acmeOverlay = {
      $schema: 'https://schema.tauri.app/config/2',
      productName: 'Acme Desktop',
      identifier: 'com.example.acme.desktop',
      bundle: { resources: ['gact-runtime/**/*'] },
    };
    writeFileSync(
      resolve(profileDir, 'tauri.acme.conf.json'),
      `${JSON.stringify(acmeOverlay, null, 2)}\n`,
    );

    const configPath = resolve(tmpRoot, 'brand.config.json');
    writeFileSync(
      configPath,
      `${JSON.stringify({ profile: 'acme', brandingRoot }, null, 2)}\n`,
    );

    const overlay = resolveNativeBrandOverlay(configPath);
    assert.equal(overlay, resolve(profileDir, 'tauri.acme.conf.json'));

    const merged = mergeConfig(
      { productName: 'Base', bundle: { icon: ['icons/icon.ico'] } },
      JSON.parse(readFileSync(overlay, 'utf8')),
    );
    assert.equal(merged.productName, 'Acme Desktop');
    assert.equal(merged.identifier, 'com.example.acme.desktop');
    assert.deepEqual(merged.bundle.icon, ['icons/icon.ico']);
    assert.deepEqual(merged.bundle.resources, ['gact-runtime/**/*']);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('with no override, the default gact profile resolves the tracked workspace overlay', () => {
  // `branding/gact/` ships no tauri.gact.conf.json of its own, so the
  // default profile must fall back to the workspace-owned overlay in
  // src-tauri/. Suspend any local override for the duration of this
  // assertion so the result reflects a clean clone regardless of what this
  // machine has checked out.
  const localConfigPath = resolve(repoRoot, 'brand.config.local.json');
  const suspendedPath = resolve(repoRoot, `.brand.config.local.json.suspended-${process.pid}`);
  const hadLocalOverride = existsSync(localConfigPath);
  if (hadLocalOverride) renameSync(localConfigPath, suspendedPath);
  try {
    const overlay = resolveNativeBrandOverlay();
    assert.equal(overlay, resolve(desktopRoot, 'src-tauri', 'tauri.gact.conf.json'));
    const config = JSON.parse(readFileSync(overlay, 'utf8'));
    assert.equal(config.productName, 'GACT Desktop');
  } finally {
    if (hadLocalOverride) renameSync(suspendedPath, localConfigPath);
  }
});

test('brand and bundle overlays merge without dropping native identity', () => {
  assert.deepEqual(
    mergeConfig(
      {
        productName: 'CLIO Desktop',
        app: { windows: [{ title: 'CLIO Desktop' }] },
        bundle: { icon: ['icons/icon.ico'], externalBin: ['binaries/clio-agent'] },
      },
      { bundle: { resources: ['gact-runtime/**/*'] } },
    ),
    {
      productName: 'CLIO Desktop',
      app: { windows: [{ title: 'CLIO Desktop' }] },
      bundle: {
        icon: ['icons/icon.ico'],
        externalBin: ['binaries/clio-agent'],
        resources: ['gact-runtime/**/*'],
      },
    },
  );
});
