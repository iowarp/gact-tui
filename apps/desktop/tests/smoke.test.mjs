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

test('sidecar-launcher Go module declares no workspace tie-in', () => {
  const goMod = readFileSync(resolve(root, 'sidecar-launcher', 'go.mod'), 'utf8');
  assert.match(goMod, /^module github\.com\/iowarp\/gact-tui\/apps\/desktop\/sidecar-launcher$/m);
  // The sidecar-launcher must be built with GOWORK=off so it never picks
  // up tui/ or emulator/ deps. The fetch script enforces this; here we
  // just verify the module path is the expected one so tauri.conf.json
  // and the fetch-sidecar contract stay aligned.
});

test('Tauri SSE path does not fall back to raw browser EventSource', () => {
  const live = readFileSync(resolve(root, '..', 'web', 'src', 'live.ts'), 'utf8');
  assert.doesNotMatch(live, /BRIDGE_FALLBACK_MS/);
  assert.doesNotMatch(live, /function\s+fallBack\s*\(/);

  const tauriStart = live.indexOf('if (inTauri()) {');
  assert.notEqual(tauriStart, -1, 'expected an explicit Tauri SSE branch');
  const pureWebCall = live.indexOf('openEventSource();', tauriStart);
  assert.notEqual(pureWebCall, -1, 'expected pure-web EventSource call after Tauri branch');
  const tauriBranch = live.slice(tauriStart, pureWebCall);
  assert.doesNotMatch(
    tauriBranch,
    /openEventSource\s*\(/,
    'Tauri SSE must retry the Rust bridge, not raw EventSource',
  );
});
