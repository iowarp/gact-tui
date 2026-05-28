import type {
  Capabilities,
  Message,
  PermissionRequest,
  PermissionScope,
  Session,
} from '../wire/types.js';

export interface ClientOptions {
  baseUrl: string;
  bearerToken?: string;
  fetch?: typeof fetch;
}

export class HttpError extends Error {
  override name = 'HttpError';
  /** SPEC §14 typed error envelope when the body parsed as one. */
  errorInfo?: {
    error: string;
    message: string;
    recoverable?: boolean;
    details?: Record<string, unknown>;
  };

  constructor(
    public status: number,
    public statusText: string,
    public body: string,
  ) {
    super(`HTTP ${status} ${statusText}: ${shorten(body)}`);
    // GACT v0.2 error responses wrap the typed envelope in {"error": …}.
    // Lift it onto the HttpError so callers can present a user-friendly
    // message instead of raw JSON.
    try {
      const parsed = JSON.parse(body) as {
        error?: {
          error?: string;
          message?: string;
          recoverable?: boolean;
          details?: Record<string, unknown>;
        };
      };
      const env = parsed?.error;
      if (env && typeof env.error === 'string' && typeof env.message === 'string') {
        this.errorInfo = {
          error: env.error,
          message: env.message,
          recoverable: env.recoverable,
          details: env.details,
        };
        // Surface the human-readable message at .message so default UI
        // paths show the actionable copy first.
        this.message = `${env.error}: ${env.message}`;
      }
    } catch {
      // body wasn't JSON; leave the original message intact.
    }
  }
}

function shorten(s: string): string {
  return s.length <= 200 ? s : s.slice(0, 200) + '…';
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

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      throw new HttpError(res.status, res.statusText, await res.text());
    }
    // Tolerate 204 No Content responses (some endpoints don't return a body).
    if (res.status === 204) return undefined as unknown as T;
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

  /** POST /v1/sessions — creates a new session and returns its id. */
  createSession(input: { title?: string; workspace_id?: string } = {}): Promise<Session> {
    return this.post<Session>('/v1/sessions', input);
  }

  /**
   * POST /v1/sessions/{id}/messages — append a user message. The server
   * responds with the created message envelope; streaming continuations
   * arrive on the per-session SSE feed.
   */
  sendMessage(
    sessionId: string,
    body: { text: string; metadata?: Record<string, unknown> },
  ): Promise<Message> {
    return this.post<Message>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
      { role: 'user', parts: [{ type: 'text', text: body.text }], metadata: body.metadata },
    );
  }

  /**
   * GET /v1/permissions?session_id=… — list pending permissions for a
   * session. The frontend uses this for the initial fetch; subsequent
   * arrivals come over SSE as `permission.requested` events.
   */
  permissions(sessionId: string): Promise<{ permissions: PermissionRequest[] }> {
    const qs = new URLSearchParams({ session_id: sessionId }).toString();
    return this.get<{ permissions: PermissionRequest[] }>(`/v1/permissions?${qs}`);
  }

  /**
   * POST /v1/permissions/{pid} — resolve a pending request. `decision`
   * is "approve" or "deny"; for approvals the `scope` carries the
   * inline-card button (once / session / always_tool / always_server).
   */
  resolvePermission(
    permissionId: string,
    decision: 'approve' | 'deny',
    scope?: PermissionScope,
  ): Promise<void> {
    return this.post<void>(`/v1/permissions/${encodeURIComponent(permissionId)}`, {
      decision,
      ...(decision === 'approve' && scope ? { scope } : {}),
    });
  }

  /**
   * POST /v1/sessions/{id}/cancel — interrupts an in-flight run. The
   * backend emits a `message.completed { stop_reason: "cancelled" }`
   * over SSE for any in-progress message. Returns 204.
   */
  cancelSession(sessionId: string): Promise<void> {
    return this.post<void>(`/v1/sessions/${encodeURIComponent(sessionId)}/cancel`, {});
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
