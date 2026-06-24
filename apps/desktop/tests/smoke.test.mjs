// Pure-Node smoke test — no Rust required. Verifies the desktop package wires
// the expected Tauri scaffold pieces and a known beforeBuildCommand. Adding
// real end-to-end tests against `tauri build --debug` is tracked in PLAN.md.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

test('tauri.conf.json has the expected fields', () => {
  const cfg = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.equal(cfg.productName, 'CLIO Desktop');
  assert.equal(cfg.identifier, 'ai.iowarp.clio.desktop');
  assert.match(cfg.build.beforeBuildCommand, /@clio\/web build:clio/);
  assert.match(cfg.build.beforeDevCommand, /@clio\/web dev:clio/);
  assert.equal(cfg.build.frontendDist, '../../web/dist');
});

test('neutral GACT overlay uses the matching web brand scripts', () => {
  const cfg = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.gact.conf.json'), 'utf8'));
  assert.equal(cfg.productName, 'GACT Desktop');
  assert.equal(cfg.identifier, 'land.charm.gact.desktop');
  assert.match(cfg.build.beforeBuildCommand, /@clio\/web build:gact/);
  assert.match(cfg.build.beforeDevCommand, /@clio\/web dev:gact/);
  assert.equal(cfg.app.windows[0].title, 'GACT Desktop');
  assert.equal(cfg.app.windows[0].width, 1440);
  assert.equal(cfg.app.windows[0].height, 900);
  assert.equal(cfg.app.windows[0].minWidth, 960);
  assert.equal(cfg.app.windows[0].minHeight, 600);
});

test('CSP is present, localhost-scoped, and identical across config variants', () => {
  const base = JSON.parse(
    readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
  );
  const gact = JSON.parse(
    readFileSync(resolve(root, 'src-tauri', 'tauri.gact.conf.json'), 'utf8'),
  );

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
    assert.doesNotMatch(csp, /connect-src[^;]*\shttp:\/\/\*/, 'connect-src must not use http://* wildcard');
    assert.doesNotMatch(csp, /connect-src[^;]*\shttps:\/\/\*/, 'connect-src must not use https://* wildcard');
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

test('tauri.conf.json declares the clio-agent sidecar via externalBin', () => {
  const cfg = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.ok(
    Array.isArray(cfg.bundle.externalBin),
    'expected bundle.externalBin to be an array (Wave 0a)',
  );
  assert.ok(
    cfg.bundle.externalBin.includes('binaries/clio-agent'),
    'expected externalBin to include "binaries/clio-agent" (Wave 0a)',
  );
});

test('updater plugin config is present and consistent across variants', () => {
  const base = JSON.parse(
    readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
  );
  const gact = JSON.parse(
    readFileSync(resolve(root, 'src-tauri', 'tauri.gact.conf.json'), 'utf8'),
  );

  for (const [name, cfg] of [['base', base], ['gact', gact]]) {
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
  assert.ok(
    caps.permissions.includes('process:allow-restart'),
    'process:allow-restart capability',
  );
});

test('sidecar-launcher Go module declares no workspace tie-in', () => {
  const goMod = readFileSync(resolve(root, 'sidecar-launcher', 'go.mod'), 'utf8');
  assert.match(goMod, /^module github\.com\/iowarp\/gact-tui\/apps\/desktop\/sidecar-launcher$/m);
  // The sidecar-launcher must be built with GOWORK=off so it never picks
  // up tui/ or emulator/ deps. The fetch script enforces this; here we
  // just verify the module path is the expected one so tauri.conf.json
  // and the fetch-sidecar contract stay aligned.
});

test('Tauri SSE path does not fall back to raw browser EventSource', () => {
  const connection = readFileSync(
    resolve(root, '..', 'web', 'src', 'LiveTranscriptConnection.ts'),
    'utf8',
  );
  assert.doesNotMatch(connection, /BRIDGE_FALLBACK_MS/);
  assert.doesNotMatch(connection, /function\s+fallBack\s*\(/);

  const tauriStart = connection.indexOf('if (inTauri()) {');
  assert.notEqual(tauriStart, -1, 'expected an explicit Tauri SSE branch');
  const pureWebCall = connection.indexOf('openEventSource();', tauriStart);
  assert.notEqual(pureWebCall, -1, 'expected pure-web EventSource call after Tauri branch');
  const tauriBranch = connection.slice(tauriStart, pureWebCall);
  assert.doesNotMatch(
    tauriBranch,
    /openEventSource\s*\(/,
    'Tauri SSE must retry the Rust bridge, not raw EventSource',
  );
});
