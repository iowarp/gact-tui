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

test('tauri.conf.json has the expected fields', () => {
  const cfg = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.equal(cfg.productName, 'GACT Desktop');
  assert.equal(cfg.identifier, 'ai.iowarp.gact.desktop');
  assert.match(cfg.build.beforeBuildCommand, /@clio\/web build/);
  assert.match(cfg.build.beforeDevCommand, /@clio\/web dev/);
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

test('tauri.conf.json is neutral and does not bundle a managed sidecar by default', () => {
  const cfg = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.ok(
    Array.isArray(cfg.bundle.externalBin),
    'expected bundle.externalBin to be an array',
  );
  assert.deepEqual(cfg.bundle.externalBin, []);
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
  // Opus adversarial review, fix #4: this guard used to walk ONLY
  // apps/web/src, where no `new EventSource(...)` has ever lived — the
  // actual construction sites are in apps/core/src/client/sse.ts
  // (`subscribeSessionMessageEvents`/`subscribeSessionTraceEvents`/
  // `subscribeSessionMcpTaskEvents`'s default `createEventSource` factory
  // params), which the app has always imported via `@clio/core`. Walking
  // only web/src made the "no raw EventSource" assertion below pass
  // VACUOUSLY — it certified the opposite of reality (the live transcript,
  // desktop included, always opens a plain browser EventSource; see
  // tauri_sse.ts's own docstring and the tracked decision issue,
  // gact-tui#367 — no caller branches on inTauri() to use openTauriSse at
  // all today).
  //
  //   1. the Rust SSE bridge is present and exported — the desktop path
  //      exists, ready to be wired in if #367 resolves "re-wire";
  //   2. no module OUTSIDE the tracked #367 gap constructs a raw
  //      EventSource — a NEW one appearing anywhere else still fails this
  //      guard.
  //
  // When #367 resolves "re-wire" (SSE branches on inTauri() to use
  // openTauriSse on desktop), replace the allowlist below with the
  // original hard zero-tolerance assertion.
  const webSrc = resolve(root, '..', 'web', 'src');
  const coreSrc = resolve(root, '..', 'core', 'src');

  const bridge = readFileSync(resolve(webSrc, 'tauri', 'tauri_sse.ts'), 'utf8');
  assert.match(
    bridge,
    /export\s+(async\s+)?function\s+openTauriSse/,
    'the Rust SSE bridge entry point must exist',
  );
  assert.doesNotMatch(bridge, /BRIDGE_FALLBACK_MS/);
  assert.doesNotMatch(bridge, /function\s+fallBack\s*\(/);

  // The ONLY file this guard currently allowlists — gact-tui#367 tracks the
  // decision to either wire this into openTauriSse on desktop or retire the
  // bridge instead.
  const trackedGapFile = resolve(coreSrc, 'client', 'sse.ts');

  const offenders = [];
  for (const dir of [webSrc, coreSrc]) {
    for (const file of walkSourceFiles(dir)) {
      if (!/new\s+EventSource\s*\(/.test(readFileSync(file, 'utf8'))) continue;
      if (file === trackedGapFile) continue;
      offenders.push(file);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `raw EventSource outside the gact-tui#367 tracked gap (${trackedGapFile}) is not permitted: ${offenders.join(', ')}`,
  );

  // If sse.ts is ever changed to stop constructing a raw EventSource (#367
  // resolved "re-wire", or "retire" deleting the fallback entirely), this
  // allowlist entry becomes silently unused — fail loudly instead, so the
  // guard gets revisited and tightened back to zero-tolerance rather than
  // quietly keeping a stale exception around forever.
  assert.match(
    readFileSync(trackedGapFile, 'utf8'),
    /new\s+EventSource\s*\(/,
    'gact-tui#367 tracked-gap file no longer constructs a raw EventSource — tighten this guard back to zero-tolerance',
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
