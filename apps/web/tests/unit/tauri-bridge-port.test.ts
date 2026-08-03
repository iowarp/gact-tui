/**
 * Tauri bridge surface.
 *
 * This file used to byte-compare the bridge against the legacy tree while both
 * existed. That tree is now deleted, so the comparison has no counterpart —
 * keeping it would have meant a test that could only ever pass.
 *
 * What still needs guarding is the CONTRACT the Rust shell depends on: the
 * bridge entry points it calls, and the menu action id set that
 * `apps/desktop/src-tauri/src/menu_spec_tests.rs` embeds from this app via
 * include_str!. Drift there breaks the desktop build from the JS side with
 * nothing failing here — which is what the old pin actually protected against.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_MENU_ACTIONS } from '../../src/tauri/menu-actions';

const TAURI = resolve(__dirname, '..', '..', 'src', 'tauri');
const read = (name: string) => readFileSync(resolve(TAURI, name), 'utf8');

describe('tauri bridge', () => {
  it.each([
    ['tauri_sse.ts', /export\s+(async\s+)?function\s+openTauriSse/],
    // Exported as a typed const, not a function declaration.
    ['tauri_http.ts', /export\s+const\s+tauriFetch\s*:/],
    ['tauri_runtime.ts', /export\s+function\s+inTauri/],
    ['tauriApi.ts', /export\s+(async\s+)?function\s+invoke/],
    ['tauri_ssh.ts', /export\s+(async\s+)?function\s+openSshTunnel/],
  ])('%s still exports the entry point the shell calls', (file, pattern) => {
    expect(read(file as string)).toMatch(pattern as RegExp);
  });

  it('the menu action set matches the JSON the Rust MENU_SPEC embeds', () => {
    const json = JSON.parse(read('menu-actions.json')) as { actions: string[] };
    expect(new Set(ALL_MENU_ACTIONS)).toEqual(new Set(json.actions));
    expect(json.actions.length).toBeGreaterThan(0);
  });

  it('no bridge module reaches for a raw EventSource', () => {
    // The desktop path goes through the Rust bridge. A raw EventSource here
    // would bypass it and silently break tunnelled/remote backends.
    for (const file of [
      'tauri.ts',
      'tauri_sse.ts',
      'tauri_sse_debug.ts',
      'tauri_http.ts',
      'tauriApi.ts',
    ]) {
      expect(read(file)).not.toMatch(/new\s+EventSource\s*\(/);
    }
  });
});
