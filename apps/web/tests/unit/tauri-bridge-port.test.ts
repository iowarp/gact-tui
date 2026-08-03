/**
 * Drift pins for the modules ported verbatim from the legacy tree.
 *
 * These files were COPIED, not rewritten, so the same Tauri shell keeps
 * working against the new app. While both trees exist, a copy can silently
 * drift from its source — and `menu-actions.json` is worse than that: the Rust
 * MENU_SPEC embeds the LEGACY path (`apps/desktop/src-tauri/src/menu_spec_tests.rs`
 * -> `../../../web/src/menu-actions.json`), so a drifted copy here would make
 * the new app's menu contract diverge from the shell that renders it with
 * nothing failing.
 *
 * These pins delete themselves with the legacy tree at cutover (gact-tui#339),
 * at which point the Rust include_str! must be repointed at this app.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PORTED = [
  'tauri.ts',
  'tauriApi.ts',
  'tauri_http.ts',
  'tauri_sse.ts',
  'tauri_sse_debug.ts',
  'tauri_runtime.ts',
  'tauri_install.ts',
  'tauri_ssh.ts',
  'tauri_update.ts',
  'menu-actions.ts',
  'menu-actions.json',
] as const;

const legacyPath = (name: string) => resolve(__dirname, '..', '..', '..', 'web.old', 'src', name);
const portedPath = (name: string) => resolve(__dirname, '..', '..', 'src', 'tauri', name);

describe('ported Tauri bridge', () => {
  it.each(PORTED)('%s is byte-identical to the legacy source', (name) => {
    const legacy = readFileSync(legacyPath(name));
    const ported = readFileSync(portedPath(name));
    expect(ported.equals(legacy)).toBe(true);
  });

  it('pins the menu contract the Rust MENU_SPEC embeds', () => {
    // The Rust side asserts against apps/web/src/menu-actions.json. Until that
    // include_str! is repointed at cutover, the action id SET must match.
    const legacy = JSON.parse(readFileSync(legacyPath('menu-actions.json'), 'utf8')) as {
      actions: string[];
    };
    const ported = JSON.parse(readFileSync(portedPath('menu-actions.json'), 'utf8')) as {
      actions: string[];
    };
    expect(new Set(ported.actions)).toEqual(new Set(legacy.actions));
    expect(ported.actions.length).toBeGreaterThan(0);
  });
});
