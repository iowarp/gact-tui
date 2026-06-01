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
  return new Response(resp.body, {
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

interface SseBridgeMessage {
  kind: 'open' | 'event' | 'error' | 'closed';
  data?: string;
  message?: string;
}

export interface SseBridgeHandle {
  close: () => void;
}

export interface SseBridgeHandlers {
  onOpen: () => void;
  /** Raw SSE `data:` payload (a JSON envelope) for one event. */
  onData: (data: string) => void;
  onError: (message?: string) => void;
  onClosed: () => void;
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
  const { invoke, Channel } = await import('@tauri-apps/api/core');
  const ch = new Channel<SseBridgeMessage>();
  ch.onmessage = (m) => {
    switch (m.kind) {
      case 'open':
        handlers.onOpen();
        break;
      case 'event':
        if (typeof m.data === 'string') handlers.onData(m.data);
        break;
      case 'error':
        handlers.onError(m.message);
        break;
      case 'closed':
        handlers.onClosed();
        break;
    }
  };
  const id = await invoke<number>('gact_sse_open', { url, headers: {}, onEvent: ch });
  return {
    close: () => {
      void invoke('gact_sse_close', { id });
    },
  };
}
