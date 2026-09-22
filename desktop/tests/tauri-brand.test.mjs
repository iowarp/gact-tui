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

import {
  mergeConfig,
  mergeOverlayPaths,
  parseArgv,
  resolveNativeBrandOverlay,
  resolveOverlayPaths,
} from '../scripts/run-tauri-branded.mjs';

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

test('a macOS overlay patches the same window entry without dropping the brand title', () => {
  // Mirrors the real chain: base config, then the brand overlay (sets
  // title/decorations), then tauri.macos.conf.json merged in LAST (sets
  // decorations/titleBarStyle/hiddenTitle for the traffic lights). Neither
  // side's window fields should clobber the other's.
  const base = {
    app: {
      windows: [
        {
          title: 'Agent Workspace',
          width: 1440,
          height: 900,
          decorations: false,
        },
      ],
    },
  };
  const brandOverlay = {
    productName: 'CLIO Desktop',
    app: { windows: [{ title: 'CLIO Desktop' }] },
  };
  const macosOverlay = {
    app: {
      windows: [{ decorations: true, titleBarStyle: 'Overlay', hiddenTitle: true }],
    },
  };

  const merged = mergeConfig(mergeConfig(base, brandOverlay), macosOverlay);

  assert.deepEqual(merged.app.windows, [
    {
      title: 'CLIO Desktop',
      width: 1440,
      height: 900,
      decorations: true,
      titleBarStyle: 'Overlay',
      hiddenTitle: true,
    },
  ]);
});

test('arrays of primitives still replace wholesale, unlike app.windows', () => {
  assert.deepEqual(
    mergeConfig({ bundle: { icon: ['a.ico', 'b.ico', 'c.ico'] } }, { bundle: { icon: ['only.ico'] } })
      .bundle.icon,
    ['only.ico'],
  );
});

test('the element-wise merge is keyed on the exact app.windows path, not "any array of objects"', () => {
  // Same shape as app.windows (an array of plain objects) but at a
  // different path — must still replace wholesale, not merge by index.
  const merged = mergeConfig(
    { plugins: { somePlugin: { targets: [{ id: 'a', keep: true }, { id: 'b' }] } } },
    { plugins: { somePlugin: { targets: [{ id: 'only' }] } } },
  );
  assert.deepEqual(merged.plugins.somePlugin.targets, [{ id: 'only' }]);

  // app.windows itself still merges element-wise at its real path.
  const withWindows = mergeConfig(
    { app: { windows: [{ title: 'Base', decorations: false }] } },
    { app: { windows: [{ decorations: true }] } },
  );
  assert.deepEqual(withWindows.app.windows, [{ title: 'Base', decorations: true }]);
});

test('parseArgv folds a caller --config into the overlay list instead of forwarding it', () => {
  assert.deepEqual(
    parseArgv(['build', '--config', '/tmp/ci.conf.json', '--bundles', 'dmg']),
    { tauriArgs: ['build', '--bundles', 'dmg'], extraOverlayPaths: ['/tmp/ci.conf.json'] },
  );

  // The legacy trailing `--merge-config <path>...` form still works and
  // composes with a leading `--config`.
  assert.deepEqual(
    parseArgv(['build', '--config', 'a.json', '--merge-config', 'b.json', 'c.json']),
    { tauriArgs: ['build'], extraOverlayPaths: ['a.json', 'b.json', 'c.json'] },
  );
});

// Regression for #417's macOS DMG gap: clio-agent's bundles workflow calls
// `pnpm --filter @clio/desktop tauri build --config "$cfg"` UNCHANGED — a
// plain `--config`, not `--merge-config`. Because desktop/package.json now
// points the "tauri" script at this wrapper instead of the raw CLI, that
// caller-supplied config must still end up folded in alongside the brand
// overlay, and — on darwin — the macOS traffic-light overlay must always be
// merged in LAST, after both, so it is never lost regardless of what the
// caller's own --config sets.
test('a caller --config folds into the overlay chain, and the macOS overlay always wins last on darwin', () => {
  const localConfigPath = resolve(repoRoot, 'brand.config.local.json');
  const suspendedPath = resolve(repoRoot, `.brand.config.local.json.suspended-${process.pid}`);
  const hadLocalOverride = existsSync(localConfigPath);
  if (hadLocalOverride) renameSync(localConfigPath, suspendedPath);
  const tmpRoot = mkdtempSync(resolve(tmpdir(), 'gact-tui-tauri-config-'));
  try {
    // The default (no-override) profile is "gact", whose native overlay
    // (src-tauri/tauri.gact.conf.json) sets app.windows[0].decorations: false
    // — the same shape any real brand overlay has.
    const extraConfigPath = resolve(tmpRoot, 'ci-extra.conf.json');
    writeFileSync(
      extraConfigPath,
      `${JSON.stringify({ identifier: 'ci.extra.identifier' }, null, 2)}\n`,
    );

    const { tauriArgs, extraOverlayPaths } = parseArgv([
      'build',
      '--config',
      extraConfigPath,
      '--bundles',
      'dmg',
    ]);
    assert.deepEqual(tauriArgs, ['build', '--bundles', 'dmg']);
    assert.deepEqual(extraOverlayPaths, [extraConfigPath]);

    const darwinOverlays = resolveOverlayPaths({ extraOverlayPaths, platform: 'darwin' });
    const darwinMerged = mergeOverlayPaths(darwinOverlays);
    assert.equal(darwinMerged.identifier, 'ci.extra.identifier');
    assert.equal(darwinMerged.app.windows[0].decorations, true);
    assert.equal(darwinMerged.app.windows[0].titleBarStyle, 'Overlay');

    const linuxOverlays = resolveOverlayPaths({ extraOverlayPaths, platform: 'linux' });
    const linuxMerged = mergeOverlayPaths(linuxOverlays);
    assert.equal(linuxMerged.identifier, 'ci.extra.identifier');
    assert.equal(linuxMerged.app.windows[0].decorations, false);
    assert.equal(linuxMerged.app.windows[0].titleBarStyle, undefined);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (hadLocalOverride) renameSync(suspendedPath, localConfigPath);
  }
});
