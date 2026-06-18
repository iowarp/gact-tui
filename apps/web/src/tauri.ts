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
 * Detects whether the current page is running inside a Tauri shell.
 *
 * Tauri 2 exposes `window.isTauri` as the public runtime signal. Some
 * builds also expose global/internal bridge objects depending on config,
 * so keep those as fallbacks for packaged and test shells.
 */
export function inTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const runtimeWindow = window as typeof window & {
    isTauri?: boolean;
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return (
    runtimeWindow.isTauri === true ||
    typeof runtimeWindow.__TAURI__ !== 'undefined' ||
    typeof runtimeWindow.__TAURI_INTERNALS__ !== 'undefined'
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

/**
 * Fetch implementation that routes through the Rust-side `gact_http`
 * Tauri command (bypassing the WebView's CORS layer). When called
 * outside Tauri it falls through to the browser's native fetch.
 *
 * Returns a value compatible with `globalThis.fetch`, so it can be
 * passed straight into `new Client({fetch: tauriFetch})` without any
 * shim code in `@clio/core`.
 */
type RustHttpResponse = {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
};

export const tauriFetch: typeof fetch = async (input, init) => {
  if (!inTauri()) {
    return globalThis.fetch(input, init);
  }
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  const h = init?.headers;
  if (h instanceof Headers) {
    h.forEach((v, k) => {
      headers[k] = v;
    });
  } else if (Array.isArray(h)) {
    for (const [k, v] of h) headers[k] = v;
  } else if (h && typeof h === 'object') {
    Object.assign(headers, h);
  }
  const body =
    typeof init?.body === 'string'
      ? init.body
      : init?.body == null
        ? undefined
        : String(init.body);

  const { invoke } = await import('@tauri-apps/api/core');
  const resp = await invoke<RustHttpResponse>('gact_http', {
    req: { method, url, headers, body },
  });
  const respHeaders = new Headers();
  for (const [k, v] of Object.entries(resp.headers)) respHeaders.set(k, v);
  // 204/205/304 are null-body statuses: the Response constructor THROWS if
  // given any body (even "") for them. The Rust bridge always returns a
  // String body, so map it to null here — otherwise every 204 endpoint
  // (permission resolve, deletes, compact…) throws client-side in the
  // desktop even though the server applied the change. Found by the
  // real-WebView e2e (1.0 item H hardening).
  const nullBody =
    resp.status === 204 || resp.status === 205 || resp.status === 304;
  return new Response(nullBody ? null : resp.body, {
    status: resp.status,
    statusText: resp.status_text,
    headers: respHeaders,
  });
};

export interface TunnelRequest {
  host: string;
  user: string;
  remote_port: number;
  key_path: string;
  passphrase?: string;
}

export interface TunnelHandle {
  local_url: string;
  local_port: number;
}

/**
 * Spawn `ssh -L <local_port>:127.0.0.1:<remote_port> user@host` via the
 * Tauri shell. Returns the local URL the frontend should point its
 * Client at. Rejects with the typed `TunnelError.to_string()` payload
 * when ssh is missing / spawn fails / keychain write fails.
 *
 * Pure-web build: callers should guard via `inTauri()`.
 */
export async function openSshTunnel(req: TunnelRequest): Promise<TunnelHandle> {
  if (!inTauri()) {
    throw new Error('openSshTunnel() called outside Tauri shell');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<TunnelHandle>('tunnel_open', { request: req });
}

/** Native menu action ids — must stay in lockstep with the Rust
 * MENU_SPEC in src-tauri/src/menu.rs (1.0 item 9). */
export type MenuAction =
  | 'new-session'
  | 'import-session'
  | 'export-session'
  | 'open-settings'
  | 'toggle-inspector'
  | 'toggle-sessions'
  | 'cycle-density'
  | 'command-palette'
  | 'keyboard-shortcuts'
  | 'fullscreen'
  | 'help-docs'
  | 'about';

/**
 * Subscribe to native window-menu actions (1.0 item 9). The Rust side
 * emits `clio:menu` with `{action}` for every non-predefined menu item.
 * Returns an unsubscribe function. Pure-web build: native menus don't
 * exist, so this is a no-op.
 */
export function onMenuAction(handler: (action: MenuAction) => void): () => void {
  if (!inTauri()) return () => undefined;
  let unlisten: (() => void) | null = null;
  let cancelled = false;
  void import('@tauri-apps/api/event').then(async ({ listen }) => {
    const un = await listen<{ action: MenuAction }>('clio:menu', (e) => {
      handler(e.payload.action);
    });
    // The subscriber may have cleaned up before listen() resolved.
    if (cancelled) un();
    else unlisten = un;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/**
 * Kick off the first-run "one swoop" clio-agent install. Runs the upstream
 * installer in the Rust supervisor and streams progress back over the
 * `clio:install-*` events (subscribe via {@link onInstallProgress}).
 *
 * Resolves as soon as the worker thread is launched — NOT when the install
 * finishes. Completion is signalled by `clio:install-done` /
 * `clio:install-failed`, so callers must subscribe BEFORE invoking.
 *
 * Pure-web build: no Tauri, so this is a no-op (the `needs_install` status
 * can never occur outside the shell).
 */
export async function installClio(): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('install_clio');
}

/**
 * Repair / reinstall the clio-agent runtime — the boot-failure card's
 * "Repair install" action. Distinct from Retry (re-probe/re-spawn the
 * existing install): this re-runs the upstream installer with a force flag
 * so a broken venv/runtime is rebuilt from scratch.
 *
 * Streams over the SAME `clio:install-*` events as {@link installClio}, so
 * callers reuse {@link onInstallProgress} — subscribe BEFORE invoking.
 *
 * Pure-web build: no Tauri, so this is a no-op.
 */
export async function repairClio(): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('repair_clio');
}

/**
 * Reveal the persisted boot log in the OS file manager — the boot-failure
 * card's "Open logs" action. Resolves to the revealed path (for display) or
 * rejects with the Rust-side error string. The log is rewritten at the
 * start of every boot/install/repair attempt, so it always reflects the
 * most recent failure.
 *
 * Pure-web build: no Tauri / no on-disk log, so this is a no-op that
 * resolves to null.
 */
export async function openLogs(): Promise<string | null> {
  if (!inTauri()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('open_logs');
}

/** Payload of `clio:install-failed`. `code` is the installer's exit code, or
 * null when it could not be launched at all. `tail` is the last ~30 lines of
 * combined stdout/stderr. */
export interface InstallFailure {
  code: number | null;
  tail: string;
}

/** Handlers for the streamed first-run install. */
export interface InstallProgressHandlers {
  /** One stdout/stderr line from the installer. */
  onLine: (line: string) => void;
  /** Installer exited 0 — the Splash should re-poll `get_backend`. */
  onDone: () => void;
  /** Installer exited non-zero (or couldn't launch) — fall back to the
   * manual error card. */
  onFailed: (failure: InstallFailure) => void;
}

/**
 * Subscribe to the streamed first-run install events emitted by the Rust
 * `install_clio` command. Returns an unsubscribe function that detaches all
 * three listeners. Mirrors {@link onMenuAction}'s pattern (listen on a
 * dynamic import, swallow if cancelled before the listener resolved).
 *
 * Pure-web build: no Tauri events, so this is a no-op returning a no-op
 * disposer.
 */
export function onInstallProgress(handlers: InstallProgressHandlers): () => void {
  if (!inTauri()) return () => undefined;
  const unlisteners: Array<() => void> = [];
  let cancelled = false;
  const attach = (un: () => void) => {
    if (cancelled) un();
    else unlisteners.push(un);
  };
  void import('@tauri-apps/api/event').then(async ({ listen }) => {
    attach(
      await listen<{ line: string }>('clio:install-progress', (e) => {
        handlers.onLine(e.payload.line);
      }),
    );
    attach(await listen('clio:install-done', () => handlers.onDone()));
    attach(
      await listen<InstallFailure>('clio:install-failed', (e) => {
        handlers.onFailed(e.payload);
      }),
    );
  });
  return () => {
    cancelled = true;
    for (const un of unlisteners) un();
    unlisteners.length = 0;
  };
}

interface SseBridgeMessage {
  kind: 'open' | 'event' | 'error' | 'closed';
  data?: string;
  message?: string;
}

export interface SseBridgeHandle {
  close: () => void;
}

export interface SseBridgeDebugState {
  url: string;
  state:
    | 'idle'
    | 'importing'
    | 'invoking'
    | 'handle-ready'
    | 'open'
    | 'event'
    | 'error'
    | 'closed'
    | 'close-requested'
    | 'channel-open'
    | 'channel-event'
    | 'channel-error'
    | 'channel-closed';
  lastMessage?: string;
  eventCount: number;
  openedAt?: number;
  updatedAt: number;
}

function recordSseDebug(update: Partial<SseBridgeDebugState> & { url: string }) {
  if (typeof window === 'undefined') return;
  const debugWindow = window as typeof window & {
    __gactSseDebug?: SseBridgeDebugState;
  };
  const prev = debugWindow.__gactSseDebug;
  debugWindow.__gactSseDebug = {
    url: update.url,
    state: update.state ?? prev?.state ?? 'idle',
    lastMessage: update.lastMessage ?? prev?.lastMessage,
    eventCount: update.eventCount ?? prev?.eventCount ?? 0,
    openedAt: update.openedAt ?? prev?.openedAt,
    updatedAt: Date.now(),
  };
}

export interface SseBridgeHandlers {
  onOpen: () => void;
  /** Raw SSE `data:` payload (a JSON envelope) for one event. */
  onData: (data: string) => void;
  onError: (message?: string) => void;
  onClosed: () => void;
}

interface SseBridgeEventPayload {
  client_id: string;
  message: SseBridgeMessage;
}

function dispatchSseBridgeMessage(
  url: string,
  handlers: SseBridgeHandlers,
  m: SseBridgeMessage,
) {
  switch (m.kind) {
    case 'open':
      recordSseDebug({ url, state: 'open', openedAt: Date.now() });
      handlers.onOpen();
      break;
    case 'event':
      if (typeof m.data === 'string') {
        const prev = (window as typeof window & { __gactSseDebug?: SseBridgeDebugState })
          .__gactSseDebug;
        recordSseDebug({
          url,
          state: 'event',
          eventCount: (prev?.eventCount ?? 0) + 1,
          lastMessage: m.data.slice(0, 240),
        });
        handlers.onData(m.data);
      }
      break;
    case 'error':
      recordSseDebug({ url, state: 'error', lastMessage: m.message ?? 'sse bridge error' });
      handlers.onError(m.message);
      break;
    case 'closed':
      recordSseDebug({ url, state: 'closed' });
      handlers.onClosed();
      break;
  }
}

/**
 * Open an SSE stream through the Rust `gact_sse_open` bridge instead of
 * a raw browser `EventSource`. Rust reads the stream (no WebView CORS
 * layer) and forwards each event's data over a Tauri Channel. This is
 * what makes desktop live-streaming independent of clio's CORS headers
 * — and lets the bearer token ride along (EventSource can't set headers;
 * the token travels in the sseUrl query string per SPEC §7). See
 * `apps/SECURITY.md` + issue #111.
 *
 * Pure-web build: callers should guard via `inTauri()` and fall back to
 * `new EventSource(...)`.
 */
export async function openTauriSse(
  url: string,
  handlers: SseBridgeHandlers,
): Promise<SseBridgeHandle> {
  if (!inTauri()) {
    throw new Error('openTauriSse() called outside Tauri shell');
  }
  recordSseDebug({ url, state: 'importing', eventCount: 0 });
  const { invoke, Channel } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  recordSseDebug({ url, state: 'invoking', eventCount: 0 });
  const clientId = `sse-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const unlisten = await listen<SseBridgeEventPayload>('gact:sse', (event) => {
    if (event.payload.client_id !== clientId) return;
    dispatchSseBridgeMessage(url, handlers, event.payload.message);
  });
  const ch = new Channel<SseBridgeMessage>();
  // Linux WebKit CI proved Rust can send over Channel while the frontend
  // callback never fires. Keep the Channel for command compatibility, but
  // consume the keyed Tauri event above as the live transcript transport.
  ch.onmessage = (m) => {
    recordSseDebug({ url, state: `channel-${m.kind}` });
  };
  const id = await invoke<number>('gact_sse_open', {
    url,
    headers: {},
    onEvent: ch,
    clientId,
  });
  recordSseDebug({ url, state: 'handle-ready' });
  return {
    close: () => {
      recordSseDebug({ url, state: 'close-requested' });
      unlisten();
      void invoke('gact_sse_close', { id });
    },
  };
}
