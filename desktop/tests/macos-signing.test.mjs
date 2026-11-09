// macOS Developer ID signing and notarization contract (#739 A1-A6).
//
// codesign and notarytool only exist on macOS runners, so these checks pin the
// configuration and workflow wiring that every platform can read. The scripts
// themselves are exercised by the `tauri bundle · macos-latest` job.
import assert from 'node:assert/strict';
import { accessSync, constants, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bundlesGactRuntime,
  macosRuntimeSigningIdentity,
  macosThinArch,
} from '../scripts/run-tauri-branded.mjs';

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(desktopDir, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

test('base config enables the hardened runtime with app entitlements on macOS 14+', () => {
  const macOS = readJson('desktop/src-tauri/tauri.conf.json').bundle.macOS;
  assert.equal(macOS.minimumSystemVersion, '14.0');
  assert.equal(macOS.hardenedRuntime, true);
  assert.equal(macOS.entitlements, 'entitlements/app.entitlements');
  assert.equal(macOS.signingIdentity, undefined, 'the identity comes from APPLE_SIGNING_IDENTITY');
  read(`desktop/src-tauri/${macOS.entitlements}`);
});

test('entitlements grant only the justified runtime exceptions', () => {
  const app = read('desktop/src-tauri/entitlements/app.entitlements');
  const runtime = read('desktop/src-tauri/entitlements/runtime.entitlements');
  const keys = (plist) => [...plist.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);
  assert.deepEqual(keys(app), [
    'com.apple.security.network.client',
    'com.apple.security.network.server',
  ]);
  assert.deepEqual(keys(runtime), [
    'com.apple.security.cs.disable-library-validation',
    'com.apple.security.cs.allow-unsigned-executable-memory',
  ]);
  for (const plist of [app, runtime]) {
    assert.doesNotMatch(plist, /<key>[^<]*allow-dyld-environment-variables<\/key>/);
  }
  const dyld = read('desktop/src-tauri/entitlements/runtime-dyld.entitlements');
  assert.deepEqual(keys(dyld), [
    ...keys(runtime),
    'com.apple.security.cs.allow-dyld-environment-variables',
  ]);
  for (const plist of [app, runtime, dyld]) {
    assert.doesNotMatch(plist, /<key>com\.apple\.security\.app-sandbox<\/key>/);
    assert.doesNotMatch(plist, /<key>[^<]*allow-jit<\/key>/);
  }
  const signer = read('desktop/scripts/macos-sign-runtime.sh');
  assert.match(signer, /DYLD_EXECUTABLES="\$\{MACOS_DYLD_EXECUTABLES-clio_run\}"/);
});

test('signing scripts are executable and use hardened runtime with timestamps', () => {
  for (const script of [
    'macos-sign-runtime.sh',
    'macos-verify-app.sh',
    'macos-notarize.sh',
    'macos-signing-setup.sh',
  ]) {
    accessSync(resolve(desktopDir, 'scripts', script), constants.X_OK);
  }
  const sign = read('desktop/scripts/macos-sign-runtime.sh');
  assert.match(sign, /--options runtime/);
  assert.match(sign, /--timestamp\)/);
  assert.match(sign, /--invalidation-mode unchecked-hash/);
  assert.match(sign, /Inside-out: libraries, then executables/);
  // /usr/bin/lipo is a stub that offers to install Xcode tools on clean Macs.
  assert.match(sign, /xcode-select -p >\/dev\/null 2>&1 \|\| die/);
});

test('signing setup keeps notarization variables away from Tauri unless complete', () => {
  const setup = read('desktop/scripts/macos-signing-setup.sh');
  assert.match(setup, /export_env APPLE_SIGNING_IDENTITY -\n/);
  assert.match(setup, /export_env APPLE_API_KEY_PATH "\$key_path"/);
  assert.match(setup, /output notarize false/);
});

test('stub-runtime installers never create updater artifacts', () => {
  assert.deepEqual(readJson('desktop/src-tauri/tauri.no-updater.conf.json').bundle, {
    createUpdaterArtifacts: false,
  });
  const apps = read('.github/workflows/apps.yml');
  assert.match(
    apps,
    /- name: Build installer\n\s+run: .*--config src-tauri\/tauri\.no-updater\.conf\.json/,
  );
  assert.doesNotMatch(apps, /os: macos-13/, 'macos-13 runners are retired');
});

test('desktop release builds macOS per architecture and gates signing on secrets', () => {
  const release = read('.github/workflows/desktop-release.yml');
  assert.doesNotMatch(release, /universal-apple-darwin/);
  assert.match(release, /target: aarch64-apple-darwin, args: '--target aarch64-apple-darwin'/);
  assert.match(release, /fetch-sidecar \$\{\{ matrix\.target \}\}/);
  assert.match(release, /run: bash desktop\/scripts\/macos-signing-setup\.sh setup/);
  assert.match(release, /steps\.apple\.outputs\.notarize == 'true'/);
  assert.match(release, /macos-notarize\.sh "\$dmg"/);
  assert.match(release, /macos-verify-app\.sh \$mode/);
  assert.match(
    release,
    /if: always\(\) && runner\.os == 'macOS'\n\s+run: bash desktop\/scripts\/macos-signing-setup\.sh cleanup/,
  );
  // Certificate secrets only reach the setup step; Tauri would otherwise
  // create a second keychain, and empty notarization variables count as set.
  assert.equal(release.match(/secrets\.APPLE_CERTIFICATE \}\}/g)?.length, 1);
});

test('pull requests get a verified macOS DMG artifact without notarization', () => {
  const apps = read('.github/workflows/apps.yml');
  const job = apps.slice(apps.indexOf('  macos-bundle:'), apps.indexOf('  native-webview-proof:'));
  assert.match(job, /github\.event_name == 'pull_request'/);
  assert.match(job, /--config src-tauri\/tauri\.bundled\.conf\.json/);
  assert.match(job, /--config src-tauri\/tauri\.no-updater\.conf\.json/);
  assert.match(job, /macos-verify-app\.sh/);
  assert.match(job, /upload-artifact/);
  assert.doesNotMatch(job, /APPLE_API|APPLE_ID|APPLE_PASSWORD|macos-notarize/);
});

test('bundlesGactRuntime detects the exploded runtime only', () => {
  assert.equal(bundlesGactRuntime({ bundle: { resources: ['gact-runtime/**/*'] } }), true);
  assert.equal(bundlesGactRuntime({ bundle: { resources: { 'gact-runtime/': 'x' } } }), true);
  assert.equal(
    bundlesGactRuntime({
      bundle: { resources: ['gact-runtime.tar.zst', 'gact-runtime.pack.json'] },
    }),
    false,
  );
  assert.equal(bundlesGactRuntime({ bundle: {} }), false);
});

test('runtime pre-sign runs only for darwin bundle builds and follows Tauri identity order', () => {
  const config = { bundle: { resources: ['gact-runtime/**/*'] } };
  const base = { tauriArgs: ['build'], config, platform: 'darwin', env: {} };
  assert.equal(macosRuntimeSigningIdentity(base), '-');
  assert.equal(
    macosRuntimeSigningIdentity({
      ...base,
      config: { bundle: { ...config.bundle, macOS: { signingIdentity: 'Config ID' } } },
    }),
    'Config ID',
  );
  assert.equal(
    macosRuntimeSigningIdentity({
      ...base,
      config: { bundle: { ...config.bundle, macOS: { signingIdentity: 'Config ID' } } },
      env: { APPLE_SIGNING_IDENTITY: 'Developer ID Application: X (T)' },
    }),
    'Developer ID Application: X (T)',
  );
  assert.equal(macosRuntimeSigningIdentity({ ...base, platform: 'linux' }), null);
  assert.equal(macosRuntimeSigningIdentity({ ...base, tauriArgs: ['dev'] }), null);
  assert.equal(
    macosRuntimeSigningIdentity({ ...base, tauriArgs: ['build', '--debug', '--no-bundle'] }),
    null,
  );
  assert.equal(
    macosRuntimeSigningIdentity({ ...base, env: { CLIO_MACOS_SIGN_RUNTIME: '0' } }),
    null,
  );
  assert.equal(macosRuntimeSigningIdentity({ ...base, config: {} }), null);
});

test('macosThinArch maps the build target to a lipo architecture', () => {
  assert.equal(macosThinArch(['build', '--target', 'aarch64-apple-darwin']), 'arm64');
  assert.equal(macosThinArch(['build', '--target', 'x86_64-apple-darwin']), 'x86_64');
  assert.equal(macosThinArch(['build', '--target', 'universal-apple-darwin']), null);
  assert.equal(macosThinArch(['build'], 'arm64'), 'arm64');
  assert.equal(macosThinArch(['build'], 'x64'), 'x86_64');
});
