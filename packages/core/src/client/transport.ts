import { HttpError, TransportTimeoutError } from './http_error.js';

export { HttpError, TransportTimeoutError } from './http_error.js';
export { bytesToBase64, normalizeWorkspaceMediaType } from './workspace_media.js';

export interface ClientOptions {
  baseUrl: string;
  bearerToken?: string;
  fetch?: typeof fetch;
  /**
   * Returns a BCP-47 language tag (e.g. "es", "ja", "en-US") to include in
   * `Accept-Language` on every request. Re-evaluated per call so callers
   * can flip locale at runtime without reconstructing the client.
   * Return `null`/`undefined` to send no header.
   */
  getLocale?: () => string | null | undefined;
  /**
   * Per-request timeout in milliseconds for the shared HTTP transport
   * (JSON GET/POST/PUT/DELETE and `response()`), applied to every call.
   * Defaults to 30_000 (30s). Pass `0` or `Infinity` to disable — no timer
   * is armed and the caller's own signal (if any) governs cancellation.
   *
   * Note: this covers only the request/response transport. SSE streams open
   * their own long-lived fetch with a dedicated AbortController and are never
   * subject to this timeout.
   */
  timeoutMs?: number;
}

export class HttpTransport {
  protected readonly fetchImpl: typeof fetch;

  constructor(public readonly options: ClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  get baseUrl(): string {
    return this.options.baseUrl.replace(/\/+$/, '');
  }

  protected headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.options.bearerToken) {
      h.Authorization = `Bearer ${this.options.bearerToken}`;
    }
    const locale = this.options.getLocale?.();
    if (locale) {
      h['Accept-Language'] = locale;
    }
    return h;
  }

  /** @internal Endpoint helper modules use this through `Client` delegates. */
  async get<T>(path: string): Promise<T> {
    const res = await this.response(path);
    if (!res.ok) {
      throw new HttpError(res.status, res.statusText, await res.text());
    }
    return (await res.json()) as T;
  }

  /** @internal Endpoint helper modules use this through `Client` delegates. */
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, 'POST', body);
  }

  /** @internal Endpoint helper modules use this through `Client` delegates. */
  async del<T = void>(path: string): Promise<T> {
    return this.request<T>(path, 'DELETE', undefined);
  }

  /** @internal Endpoint helper modules use this through `Client` delegates. */
  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, 'PUT', body);
  }

  /**
   * Shared request helper used by POST/PATCH/PUT — `post()` delegates
   * here for back-compat with existing call sites.
   */
  /** @internal Endpoint helper modules use this through `Client` delegates. */
  async request<T>(
    path: string,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body: unknown,
  ): Promise<T> {
    const res = await this.response(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      throw new HttpError(res.status, res.statusText, await res.text());
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  /** @internal Endpoint helper modules use this for non-JSON response bodies. */
  async response(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { ...this.headers() };
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });

    const callerSignal = init.signal ?? undefined;
    const timeoutMs = this.options.timeoutMs ?? 30_000;
    // 0 / Infinity (or any non-positive/non-finite value) disables the timer;
    // the caller's own signal, if present, still governs cancellation.
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return await this.fetchImpl(url, { ...init, headers, signal: callerSignal });
    }

    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    // Compose the timeout with the caller's signal so either can cancel; when
    // no caller signal is supplied, the timeout signal stands alone.
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      return await this.fetchImpl(url, { ...init, headers, signal });
    } catch (err) {
      // Distinguish a timeout-driven abort from a caller-driven one: only the
      // former becomes the typed TransportTimeoutError; a caller abort re-throws
      // its original AbortError untouched.
      if (timeoutController.signal.aborted && !(callerSignal?.aborted ?? false)) {
        throw new TransportTimeoutError(url, timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
