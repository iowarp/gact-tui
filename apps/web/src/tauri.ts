/**
 * Tauri runtime detection + typed bridge to the Rust supervisor.
 *
 * The same SolidJS bundle ships inside the Tauri shell (`@clio/desktop`)
 * and as a pure-web app (`pnpm preview`). Code that needs to talk to the
 * Rust side goes through this module so the web-only build path stays
 * tree-shake-friendly and never throws on missing Tauri internals.
 *
 * IMPORTANT: when running inside Tauri, the WebView origin is
 * `http://tauri.localhost` and HTTP requests to the local sidecar
 * (e.g. http://127.0.0.1:17800) hit browser-level CORS. The
 * `tauri-plugin-http` bridge routes those requests through Rust,
 * sidestepping CORS entirely. The frontend Client uses `pickFetch()`
 * which returns the Tauri-bridged fetch inside the shell and the
 * native browser fetch in the pure-web build.
 */

import type { MenuAction } from './menu-actions.js';
import { invoke, listenTauriEvent } from './tauriApi.js';
import { inTauri } from './tauri_runtime.js';

export { inTauri } from './tauri_runtime.js';
export { tauriFetch } from './tauri_http.js';
export {
  installClio,
  onInstallProgress,
  openLogs,
  readLogs,
  repairClio,
  type InstallFailure,
  type InstallProgressHandlers,
} from './tauri_install.js';
export { openTauriSse } from './tauri_sse.js';
export { openSshTunnel, type TunnelHandle, type TunnelRequest } from './tauri_ssh.js';
export type { SseBridgeDebugState, SseBridgeHandle, SseBridgeHandlers } from './tauri_sse.js';

export interface BackendHandle {
  url: string;
  bearer_token: string;
  status: BackendStatus;
}

export type BackendStatus =
  | { kind: 'starting' }
  | { kind: 'ready' }
  // First run: the bundled launcher resolved no clio-agent-gact (exit 2).
  // The Splash reacts by auto-running `installClio()` (one swoop) rather
  // than showing the manual copy-paste error card. Only ever reported
  // inside the Tauri shell — the pure-web path can't produce it.
  | { kind: 'needs_install' }
  | { kind: 'error'; detail: string };

/**
 * Reads the current backend handle from the Rust supervisor. The handle
 * stays in `starting` until /v1/capabilities returns 200, then flips to
 * `ready` (or `error` with a message). Callers should poll on a short
 * interval.
 *
 * Throws if called outside Tauri — guard with `inTauri()`.
 */
export async function getBackend(): Promise<BackendHandle> {
  if (!inTauri()) {
    throw new Error('getBackend() called outside Tauri shell');
  }
  return invoke<BackendHandle>('get_backend');
}

/** Open a backend-created native document working copy in its OS application. */
export async function openDocumentPath(path: string): Promise<boolean> {
  if (!inTauri()) return false;
  await invoke<string>('open_document_path', { path });
  return true;
}

/** Native menu action ids. Re-exported from {@link ./menu-actions.ts}, whose
 * single source of truth is `menu-actions.json` — the same file the Rust
 * MENU_SPEC (src-tauri/src/menu_spec.rs) embeds and asserts against, so the
 * two sides cannot drift (1.0 item 9). */
export type { MenuAction } from './menu-actions.js';

/**
 * Subscribe to native window-menu actions (1.0 item 9). The Rust side
 * emits `clio:menu` with `{action}` for every non-predefined menu item.
 * Returns an unsubscribe function. Pure-web build: native menus don't
 * exist, so this is a no-op.
 */
export function onMenuAction(handler: (action: MenuAction) => void): () => void {
  if (!inTauri()) return () => undefined;
  return listenTauriEvent<{ action: MenuAction }>('clio:menu', (payload) => {
    handler(payload.action);
  });
}
