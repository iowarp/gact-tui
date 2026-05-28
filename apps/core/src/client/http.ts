import type { Capabilities, Message, Session } from '../wire/types.js';

export interface ClientOptions {
  baseUrl: string;
  bearerToken?: string;
  fetch?: typeof fetch;
}

export class HttpError extends Error {
  override name = 'HttpError';
  constructor(
    public status: number,
    public statusText: string,
    public body: string,
  ) {
    super(`HTTP ${status} ${statusText}: ${body}`);
  }
}

/**
 * Minimal HTTP client for GACT v0.2. The harness build only needs enough surface
 * for the connect screen, sidebar, and transcript shells; richer endpoints land
 * as PLAN.md items.
 */
export class Client {
  private readonly fetchImpl: typeof fetch;

  constructor(public readonly options: ClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  get baseUrl(): string {
    return this.options.baseUrl.replace(/\/+$/, '');
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.options.bearerToken) {
      h.Authorization = `Bearer ${this.options.bearerToken}`;
    }
    return h;
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await this.fetchImpl(url, { headers: this.headers() });
    if (!res.ok) {
      throw new HttpError(res.status, res.statusText, await res.text());
    }
    return (await res.json()) as T;
  }

  capabilities(): Promise<Capabilities> {
    return this.get<Capabilities>('/v1/capabilities');
  }

  sessions(): Promise<{ sessions: Session[] }> {
    return this.get<{ sessions: Session[] }>('/v1/sessions');
  }

  session(id: string): Promise<Session> {
    return this.get<Session>(`/v1/sessions/${encodeURIComponent(id)}`);
  }

  messages(sessionId: string): Promise<{ messages: Message[] }> {
    return this.get<{ messages: Message[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
    );
  }

  /**
   * Build an SSE URL with the bearer token in the query string. `EventSource`
   * cannot set custom headers, so we fall back to `?auth_token=` per SPEC §7.
   */
  sseUrl(sessionId: string): string {
    const u = new URL(`${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/events`);
    if (this.options.bearerToken) {
      u.searchParams.set('auth_token', this.options.bearerToken);
    }
    return u.toString();
  }
}
