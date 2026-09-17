// Pure-Node smoke test — no Rust required. Verifies the desktop package wires
// the expected Tauri scaffold pieces and a known beforeBuildCommand. Adding
// real end-to-end tests against `tauri build --debug` is tracked in PLAN.md.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

test('desktop release versions stay synchronized', () => {
  const packageVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
  const tauriVersion = JSON.parse(
    readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
  ).version;
  const cargo = readFileSync(resolve(root, 'src-tauri', 'Cargo.toml'), 'utf8');
  const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

  assert.equal(tauriVersion, packageVersion, 'Tauri installer version must match package.json');
  assert.equal(cargoVersion, packageVersion, 'Rust package version must match package.json');
});

test('tauri.conf.json has the expected fields', () => {
  const cfg = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.equal(cfg.productName, 'Agent Workspace');
  assert.equal(cfg.identifier, 'ai.iowarp.gact.desktop');
  assert.match(cfg.build.beforeBuildCommand, /@clio\/workspace build/);
  assert.match(cfg.build.beforeDevCommand, /@clio\/workspace dev/);
  assert.equal(cfg.build.frontendDist, '../../web/dist');
});

test('explicit GACT overlay uses the shared configurable workspace build', () => {
  const cfg = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.gact.conf.json'), 'utf8'));
  assert.equal(cfg.productName, 'GACT Desktop');
  assert.equal(cfg.identifier, 'land.charm.gact.desktop');
  assert.match(cfg.build.beforeBuildCommand, /@clio\/workspace build/);
  assert.match(cfg.build.beforeDevCommand, /@clio\/workspace dev/);
  assert.equal(cfg.app.windows[0].title, 'GACT Desktop');
  assert.equal(cfg.app.windows[0].width, 1440);
  assert.equal(cfg.app.windows[0].height, 900);
  assert.equal(cfg.app.windows[0].minWidth, 960);
  assert.equal(cfg.app.windows[0].minHeight, 600);
});

test('CSP is present, localhost-scoped, and identical across config variants', () => {
  const base = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const gact = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.gact.conf.json'), 'utf8'));

  const baseCsp = base.app?.security?.csp;
  const gactCsp = gact.app?.security?.csp;

  // (1) The brand overlay must not ship CSP-less — it carries its own CSP.
  assert.ok(typeof baseCsp === 'string' && baseCsp.length > 0, 'base config must define a CSP');
  assert.ok(
    typeof gactCsp === 'string' && gactCsp.length > 0,
    'gact overlay must define a CSP (not ship CSP-less)',
  );

  // CSP is a security setting, not a brand setting: it must stay identical.
  assert.equal(gactCsp, baseCsp, 'gact CSP must match the base CSP verbatim');

  // (2) connect-src is scoped to localhost; broad wildcards are removed because
  // remote/SSH-tunneled egress is done by Rust (gact_http/gact_sse), not the WebView.
  for (const csp of [baseCsp, gactCsp]) {
    assert.match(csp, /connect-src[^;]*'self'/, 'connect-src must allow self');
    assert.match(csp, /http:\/\/localhost:\*/, 'connect-src must allow http://localhost:*');
    assert.match(csp, /http:\/\/127\.0\.0\.1:\*/, 'connect-src must allow http://127.0.0.1:*');
    assert.match(csp, /wss?:\/\/localhost:\*/, 'connect-src must allow ws/wss localhost for SSE');
    assert.doesNotMatch(
      csp,
      /connect-src[^;]*\shttp:\/\/\*/,
      'connect-src must not use http://* wildcard',
    );
    assert.doesNotMatch(
      csp,
      /connect-src[^;]*\shttps:\/\/\*/,
      'connect-src must not use https://* wildcard',
    );
  }
});

test('Cargo.toml declares the tauri-build build-dependency', () => {
  const cargo = readFileSync(resolve(root, 'src-tauri', 'Cargo.toml'), 'utf8');
  assert.match(cargo, /tauri-build/);
  assert.match(cargo, /clio-desktop/);
});

test('default capability JSON is present', () => {
  const caps = JSON.parse(
    readFileSync(resolve(root, 'src-tauri', 'capabilities', 'default.json'), 'utf8'),
  );
  assert.equal(caps.identifier, 'default');
  assert.ok(Array.isArray(caps.permissions));
});

test('tauri.conf.json is neutral and does not bundle a managed sidecar by default', () => {
  const cfg = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.ok(Array.isArray(cfg.bundle.externalBin), 'expected bundle.externalBin to be an array');
  assert.deepEqual(cfg.bundle.externalBin, []);
});

test('bundled installer stops only its managed process tree before replacement or removal', () => {
  const cfg = JSON.parse(
    readFileSync(resolve(root, 'src-tauri', 'tauri.bundled.conf.json'), 'utf8'),
  );
  assert.equal(cfg.bundle.windows.nsis.installerHooks, 'installer-hooks.nsh');

  const hooks = readFileSync(resolve(root, 'src-tauri', 'installer-hooks.nsh'), 'utf8');
  assert.match(hooks, /NSIS_HOOK_PREINSTALL/);
  assert.match(hooks, /NSIS_HOOK_PREUNINSTALL/);
  assert.match(hooks, /NSIS_HOOK_POSTUNINSTALL/);
  assert.match(hooks, /Also remove CLIO settings, sessions, and local data/);
  assert.match(hooks, /\$LOCALAPPDATA\\ai\.iowarp\.clio\.desktop/);
  assert.match(hooks, /\$APPDATA\\ai\.iowarp\.clio\.desktop/);
  assert.match(hooks, /\$ClioRemoveUserData == \$\{BST_CHECKED\}/);
  assert.match(hooks, /StartsWith\(\$\$root/);
  assert.match(hooks, /clio-desktop\.exe/);
  assert.match(hooks, /clio-agent\.exe/);
  assert.match(hooks, /python\.exe/);
  assert.doesNotMatch(hooks, /taskkill[^\r\n]*\/IM/i, 'must not kill unrelated user processes');
});

test('updater plugin config is present and consistent across variants', () => {
  const base = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const gact = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.gact.conf.json'), 'utf8'));

  for (const [name, cfg] of [
    ['base', base],
    ['gact', gact],
  ]) {
    const updater = cfg.plugins?.updater;
    assert.ok(updater, `${name} config must define plugins.updater`);
    assert.ok(
      Array.isArray(updater.endpoints) && updater.endpoints.length > 0,
      `${name} updater must define at least one endpoint`,
    );
    assert.match(
      updater.endpoints[0],
      /releases\/latest\/download\/latest\.json$/,
      `${name} updater endpoint must point at the releases latest.json marker`,
    );
    assert.ok(
      typeof updater.pubkey === 'string' && updater.pubkey.length > 0,
      `${name} updater must declare a pubkey field`,
    );
    assert.equal(
      cfg.bundle.createUpdaterArtifacts,
      true,
      `${name} bundle must emit updater artifacts`,
    );
  }

  // Endpoint + key must stay identical across brand variants — they target the
  // same releases and are verified against the same signing key.
  assert.deepEqual(
    base.plugins.updater.endpoints,
    gact.plugins.updater.endpoints,
    'updater endpoints must match across variants',
  );
  assert.equal(
    base.plugins.updater.pubkey,
    gact.plugins.updater.pubkey,
    'updater pubkey must match across variants',
  );
});

test('Cargo.toml + lib.rs wire the updater + process plugins', () => {
  const cargo = readFileSync(resolve(root, 'src-tauri', 'Cargo.toml'), 'utf8');
  assert.match(cargo, /tauri-plugin-updater\s*=/);
  assert.match(cargo, /tauri-plugin-process\s*=/);

  const libRs = readFileSync(resolve(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  assert.match(libRs, /tauri_plugin_updater::Builder::new\(\)\.build\(\)/);
  assert.match(libRs, /tauri_plugin_process::init\(\)/);

  const caps = JSON.parse(
    readFileSync(resolve(root, 'src-tauri', 'capabilities', 'default.json'), 'utf8'),
  );
  assert.ok(caps.permissions.includes('updater:default'), 'updater:default capability');
  assert.ok(caps.permissions.includes('process:allow-restart'), 'process:allow-restart capability');
});

test('sidecar-launcher Go module declares no workspace tie-in', () => {
  const goMod = readFileSync(resolve(root, 'sidecar-launcher', 'go.mod'), 'utf8');
  assert.match(goMod, /^module github\.com\/iowarp\/gact-tui\/desktop\/sidecar-launcher$/m);
  // The sidecar-launcher must be built with GOWORK=off so it never picks
  // up tui/ or emulator/ deps. The fetch script enforces this; here we
  // just verify the module path is the expected one so tauri.conf.json
  // and the fetch-sidecar contract stay aligned.
});

test('Tauri SSE path does not fall back to raw browser EventSource', () => {
  const webSrc = resolve(root, '..', 'web', 'src');
  const connection = readFileSync(resolve(webSrc, 'lib', 'connection.ts'), 'utf8');
  const transport = readFileSync(resolve(webSrc, 'lib', 'transport', 'tauri-transport.ts'), 'utf8');
  assert.match(connection, /inTauri\(\)[\s\S]*new TauriClioTransport/);
  assert.match(transport, /gact_sse_open/);
  assert.match(transport, /Last-Event-ID/);
  assert.doesNotMatch(transport, /new\s+EventSource\s*\(/);
  assert.doesNotMatch(transport, /fetch\s*\(/);

  const offenders = [];
  for (const file of walkSourceFiles(webSrc)) {
    if (/new\s+EventSource\s*\(/.test(readFileSync(file, 'utf8'))) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    `the active web workspace must use fetch-SSE or the Rust bridge, not EventSource: ${offenders.join(', ')}`,
  );
});

/** Yield every .ts/.tsx file under `dir`, recursively. */
function walkSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
