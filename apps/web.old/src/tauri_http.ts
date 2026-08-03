/**
 * Tauri HTTP bridge: a `fetch`-compatible shim that routes requests through
 * the Rust side (bypassing the WebView CORS sandbox) when running in Tauri.
 */
import { invoke } from './tauriApi.js';
import { inTauri } from './tauri_runtime.js';

type RustHttpResponse = {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
};

/**
 * Fetch implementation that routes through the Rust-side `gact_http`
 * Tauri command, bypassing the WebView's CORS layer. Outside Tauri it
 * falls through to the browser's native fetch.
 */
export const tauriFetch: typeof fetch = async (input, init) => {
  if (!inTauri()) {
    return globalThis.fetch(input, init);
  }
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
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
    typeof init?.body === 'string' ? init.body : init?.body == null ? undefined : String(init.body);

  const resp = await invoke<RustHttpResponse>('gact_http', {
    req: { method, url, headers, body },
  });
  const respHeaders = new Headers();
  for (const [k, v] of Object.entries(resp.headers)) respHeaders.set(k, v);
  // 204/205/304 are null-body statuses: the Response constructor throws if
  // given any body for them. The Rust bridge always returns a String body, so
  // map it to null here.
  const nullBody = resp.status === 204 || resp.status === 205 || resp.status === 304;
  return new Response(nullBody ? null : resp.body, {
    status: resp.status,
    statusText: resp.status_text,
    headers: respHeaders,
  });
};
