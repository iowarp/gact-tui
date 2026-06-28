import { HttpError } from './http_error.js';

export { HttpError } from './http_error.js';
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
    return await this.fetchImpl(url, { ...init, headers });
  }
}
