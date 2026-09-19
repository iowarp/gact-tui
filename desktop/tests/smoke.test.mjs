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
  assert.equal(cfg.app.windows[0].decorations, false);
});

test('desktop variants use product-owned frameless chrome with scoped window controls', () => {
  const base = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const gact = JSON.parse(readFileSync(resolve(root, 'src-tauri', 'tauri.gact.conf.json'), 'utf8'));
  assert.equal(base.app.windows[0].decorations, false);
  assert.equal(gact.app.windows[0].decorations, false);

  const caps = JSON.parse(
    readFileSync(resolve(root, 'src-tauri', 'capabilities', 'default.json'), 'utf8'),
  );
  for (const permission of [
    'core:window:allow-close',
    'core:window:allow-is-fullscreen',
    'core:window:allow-set-fullscreen',
    'core:window:allow-start-dragging',
    'core:window:allow-toggle-maximize',
  ]) {
    assert.ok(caps.permissions.includes(permission), `${permission} capability`);
  }

  const libRs = readFileSync(resolve(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  assert.match(libRs, /cfg\(target_os = "macos"\)[\s\S]*app\.set_menu\(app_menu\)/);
});

test('desktop close, reopen, and quit lifecycle route through one guarded request_quit path', () => {
  const libRs = readFileSync(resolve(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  assert.match(
    libRs,
    /tauri_plugin_single_instance::init[\s\S]*tray::show_main_window/,
    'a second launch must restore the existing tray-resident window',
  );

  // Native close (Alt+F4 / OS close box / traffic light) must hand off to
  // the frontend's confirmation prompt instead of auto-hiding outright —
  // the old unconditional hide never gave the prompt a chance to appear.
  assert.match(
    libRs,
    /WindowEvent::CloseRequested[\s\S]*api\.prevent_close\(\)[\s\S]*CLOSE_REQUESTED_EVENT/,
    'native close must prevent the default close and emit CLOSE_REQUESTED_EVENT for the frontend prompt',
  );
  assert.match(
    libRs,
    /CLOSE_PROMPT_ACK_TIMEOUT[\s\S]*CLOSE_PROMPT_ACKED_SEQ[\s\S]*\.hide\(\)/,
    'an unacknowledged close prompt must still fall back to hiding the window (keeps Alt+F4 safe against an unloaded WebView)',
  );

  // Every quit entry point funnels through the single guarded request_quit
  // path (idempotent via claim_quit/QUIT_STARTED) rather than each one
  // reaping services and exiting on its own — that duplication is exactly
  // what let native shutdown double-teardown.
  assert.match(
    libRs,
    /fn request_quit[\s\S]*claim_quit\(\)[\s\S]*shutdown_owned_services[\s\S]*\.exit\(0\)/,
    'request_quit must be the single guarded teardown+exit path',
  );
  assert.match(
    libRs,
    /WindowEvent::Destroyed => request_quit/,
    'native window destruction must route through request_quit',
  );
  assert.match(
    libRs,
    /fn quit_clio[\s\S]{0,120}request_quit/,
    'the quit_clio command must route through request_quit',
  );

  // Scope the two run() match arms precisely (rather than a loosely-bounded
  // scan) since their doc comments are long enough that a small character
  // budget would miss real content, and an unbounded one would spill past
  // the arm into unrelated later code (e.g. request_quit's own
  // thread::spawn, a few dozen lines below Exit).
  const exitRequestedArm = libRs.match(
    /ExitRequested \{ code, api, \.\. \} => \{([\s\S]*?)\n\s*tauri::RunEvent::Exit/,
  )?.[1];
  assert.ok(exitRequestedArm, 'RunEvent::ExitRequested { code, api, .. } arm must exist');
  assert.match(
    exitRequestedArm,
    /request_quit\(app_handle\)/,
    'RunEvent::ExitRequested must route through request_quit',
  );
  // A native "last window closed" ExitRequested (code: None — distinct from
  // OUR OWN AppHandle::exit(), which always carries Some(code)) must be
  // blocked so the event loop doesn't tear down mid-reap; request_quit's own
  // exit(0) must never be blocked the same way.
  assert.match(
    exitRequestedArm,
    /code\.is_none\(\)[\s\S]*api\.prevent_exit\(\)/,
    'ExitRequested must call prevent_exit() only when code.is_none()',
  );

  const exitArm = libRs.match(/RunEvent::Exit => \{([\s\S]*?)\n\s*_ => \{\}/)?.[1];
  assert.ok(exitArm, 'RunEvent::Exit arm must exist');
  // RunEvent::Exit is the true last event Tauri delivers — some native exit
  // paths (Windows logoff/shutdown, macOS Dock Quit/session logout) skip
  // ExitRequested and deliver ONLY this, and the process can terminate the
  // instant the callback returns. Teardown here must run synchronously
  // behind claim_quit(), not on a spawned thread, or it may never finish.
  assert.match(
    exitArm,
    /if claim_quit\(\)\s*\{[\s\S]*shutdown_owned_services\(app_handle\)/,
    'RunEvent::Exit must run shutdown_owned_services synchronously behind claim_quit()',
  );
  assert.doesNotMatch(
    exitArm,
    /thread::spawn/,
    'RunEvent::Exit must not defer teardown to a background thread — nothing waits for it after this event',
  );

  // The SSE bridge holds an open reader against the GACT server shutdown_owned_services
  // is about to ask to unwind; stopping it first means the server never has
  // to wait out its own connection-close grace on a reader we were killing
  // anyway.
  assert.match(
    libRs,
    /fn shutdown_owned_services[\s\S]*sse\.stop_all\(\)[\s\S]*Supervisor>>\(\)[\s\S]*\.shutdown\(\)/,
    'shutdown_owned_services must stop the SSE bridge before asking the supervisor/backend to shut down',
  );

  assert.match(
    libRs,
    /cfg\(target_os = "macos"\)[\s\S]*RunEvent::Reopen[\s\S]*tray::show_main_window/,
    'macOS dock reopen must restore the hidden main window',
  );
});

test('tray Quit routes through the single guarded request_quit path', () => {
  // Secondary/lightweight: the primary coverage is the pure
  // tray_action_for() mapping unit-tested in tray.rs (cargo test), which
  // together with the closure's two-arm match (visible by inspection) is
  // what actually guarantees this wiring. This just double-checks the
  // literal call site didn't regress to an inline shutdown_owned_services
  // call.
  const trayRs = readFileSync(resolve(root, 'src-tauri', 'src', 'tray.rs'), 'utf8');
  assert.match(
    trayRs,
    /TrayAction::Quit\)\s*=>\s*crate::request_quit\(app\)/,
    'tray Quit must route through crate::request_quit',
  );
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
  assert.match(hooks, /\$LOCALAPPDATA\\\$\{BUNDLEID\}/);
  assert.match(hooks, /\$APPDATA\\\$\{BUNDLEID\}/);
  assert.match(hooks, /\$ClioRemoveUserData == \$\{BST_CHECKED\}/);
  assert.match(hooks, /FileWrite \$0 "\$INSTDIR"/);
  assert.match(hooks, /clio-desktop-install-root\.txt/);
  assert.match(hooks, /ExecWait '"\$SYSDIR\\WindowsPowerShell\\v1\.0\\powershell\.exe"/);
  assert.match(hooks, /-EncodedCommand/);
  const encoded = hooks.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)?.[1];
  assert.ok(encoded, 'expected an encoded process-cleanup command');
  const cleanup = Buffer.from(encoded, 'base64').toString('utf16le');
  assert.ok(encoded.length < 900, 'cleanup command must stay below the NSIS string limit');
  assert.match(cleanup, /clio-desktop-install-root\.txt/);
  assert.match(cleanup, /StartsWith\(\$r,5\)/);
  assert.match(cleanup, /clio-desktop/);
  assert.match(cleanup, /clio-agent/);
  assert.match(cleanup, /python/);
  assert.match(cleanup, /clio_run/);
  assert.doesNotMatch(hooks, /taskkill[^\r\n]*\/IM/i, 'must not kill unrelated user processes');
  const runtimeRemovals = hooks.match(/RMDir \/r "\$INSTDIR\\gact-runtime"/g) ?? [];
  assert.equal(runtimeRemovals.length, 3, 'upgrade and uninstall must remove the bundled runtime');
  assert.match(hooks, /NSIS_HOOK_POSTUNINSTALL[\s\S]*RMDir "\$INSTDIR"/);
});

test('installer hooks resolve the app-data folder from the bundle identifier macro, never a hardcoded literal', () => {
  const hooks = readFileSync(resolve(root, 'src-tauri', 'installer-hooks.nsh'), 'utf8');
  // A brand overlay (e.g. clio-agent's tauri.clio.conf.json) sets its OWN
  // `identifier`, which becomes ${BUNDLEID} in the generated installer.nsi at
  // build time. A literal "ai.iowarp.clio.desktop" here would silently clean
  // up — or fail to clean up — the WRONG app-data folder for any brand whose
  // identifier differs from gact-tui's own base tauri.conf.json.
  assert.doesNotMatch(
    hooks,
    /ai\.iowarp\.clio\.desktop/,
    'installer-hooks.nsh must not hardcode a bundle identifier — use ${BUNDLEID}',
  );
  assert.match(hooks, /\$LOCALAPPDATA\\\$\{BUNDLEID\}\\installer-options\.json/);
  assert.match(hooks, /\$LOCALAPPDATA\\\$\{BUNDLEID\}"/, 'PREINSTALL must create the ${BUNDLEID} folder');
});

test('installer collects Infrastructure choices via a custom wizard page, not a blocking MessageBox', () => {
  const hooks = readFileSync(resolve(root, 'src-tauri', 'installer-hooks.nsh'), 'utf8');
  assert.doesNotMatch(
    hooks,
    /MB_YESNO/,
    'the recommended-services prompt must be a nsDialogs page, not a MessageBox',
  );
  assert.match(hooks, /Page custom ClioInfrastructurePage ClioInfrastructurePageLeave/);
  assert.match(hooks, /Function ClioInfrastructurePage\b/);
  assert.match(hooks, /Function ClioInfrastructurePageLeave/);
  assert.match(hooks, /CLIO Search \(web search and PDF reading, runs in Docker\)/);
  assert.match(hooks, /Local model runtime \(llama\.cpp\)/);
  assert.match(hooks, /Science tool kit \(clio-kit\)/);

  // Web Search defaults on, llama.cpp defaults off, clio-kit is fixed on and
  // disabled (it always ships bundled — there is nothing to choose).
  const page = hooks.match(/Function ClioInfrastructurePage\b([\s\S]*?)FunctionEnd/)?.[1] ?? '';
  assert.match(page, /\$\{NSD_Check\} \$ClioWebSearchCheckbox/);
  assert.match(page, /\$\{NSD_Uncheck\} \$ClioLlamaCppCheckbox/);
  assert.match(page, /\$\{NSD_Check\} \$ClioKitCheckbox/);
  assert.match(page, /EnableWindow \$ClioKitCheckbox 0/);
});

test('the Infrastructure page is skipped for passive and update installs, read from the command line', () => {
  const hooks = readFileSync(resolve(root, 'src-tauri', 'installer-hooks.nsh'), 'utf8');
  const page = hooks.match(/Function ClioInfrastructurePage\b([\s\S]*?)FunctionEnd/)?.[1] ?? '';
  // A Function body compiles at !include time, before Tauri's template
  // declares $PassiveMode/$UpdateMode — referencing those Vars here would
  // silently always evaluate false (makensis only warns), so the skip must
  // read the raw command line via GetOptions instead of those template Vars.
  assert.doesNotMatch(
    page,
    /\$PassiveMode|\$UpdateMode/,
    'ClioInfrastructurePage must not reference $PassiveMode/$UpdateMode — those Vars are not yet declared at the point this Function compiles',
  );
  assert.match(page, /\$\{GetOptions\} \$CMDLINE "\/P" \$R0/);
  assert.match(page, /\$\{GetOptions\} \$CMDLINE "\/UPDATE" \$R0/);
  assert.match(page, /\$\{IfNot\} \$\{Errors\}/);
  assert.match(page, /Abort/);
});

test('installer-options.json is always written through the one v2-schema macro', () => {
  const hooks = readFileSync(resolve(root, 'src-tauri', 'installer-hooks.nsh'), 'utf8');
  const writeCalls = hooks.match(/!insertmacro CLIO_WRITE_INSTALLER_OPTIONS/g) ?? [];
  // PREINSTALL (1) + POSTINSTALL's four outcome branches (deployed / two
  // needs_attention branches / docker-unavailable) = 5 call sites, and every
  // one goes through the same macro rather than a duplicated FileWrite.
  assert.equal(writeCalls.length, 5);
  assert.match(hooks, /\$\\"schema\$\\":2/);
  assert.match(hooks, /\$\\"web_search\$\\":\$\\"'/);
  assert.match(hooks, /\$\\"llama_cpp\$\\":\$\\"'/);
  assert.match(hooks, /\$\\"clio_kit\$\\":\$\\"bundled\$\\"/);
  for (const status of ['pending', 'not_requested', 'deployed', 'needs_attention']) {
    assert.match(hooks, new RegExp(`StrCpy \\$ClioWebSearchStatus "${status}"`));
  }
  for (const status of ['requested', 'not_requested']) {
    assert.match(hooks, new RegExp(`StrCpy \\$ClioLlamaCppStatus "${status}"`));
  }
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
  assert.ok(caps.permissions.includes('process:allow-exit'), 'process:allow-exit capability');
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
