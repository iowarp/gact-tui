/**
 * Tauri runtime detection + typed bridge to the Rust supervisor.
 *
 * The same SolidJS bundle ships inside the Tauri shell (`@clio/desktop`)
 * and as a pure-web app (`pnpm preview`). Code that needs to talk to the
 * Rust side goes through this module so the web-only build path stays
 * tree-shake-friendly and never throws on missing Tauri internals.
 */

export interface BackendHandle {
  url: string;
  bearer_token: string;
  status: BackendStatus;
}

export type BackendStatus =
  | { kind: 'starting' }
  | { kind: 'ready' }
  | { kind: 'error'; detail: string };

/**
 * Detects whether the current page is running inside a Tauri shell.
 *
 * Tauri 2 exposes `window.__TAURI_INTERNALS__` immediately on page
 * load. Browsers don't, so this is the cheapest discriminator.
 */
export function inTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    // @ts-expect-error — Tauri injects this; not in lib.dom.
    typeof window.__TAURI_INTERNALS__ !== 'undefined'
  );
}

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
  // Dynamic import keeps `@tauri-apps/api/core` out of the pure-web
  // entry bundle when tree-shaking can prove `inTauri()` is false at
  // build time, and prevents a hard parse-error in Node-side tests.
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<BackendHandle>('get_backend');
}
