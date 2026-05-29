import type {
  AgentDef,
  Capabilities,
  ContextFile,
  HealthSnapshot,
  LmConfigSnapshot,
  McpServerInfo,
  MemoryStats,
  Message,
  MetricsSnapshot,
  PermissionRequest,
  PermissionScope,
  PromptDef,
  PromptSource,
  ProviderDef,
  Session,
  SessionTask,
  UserQuestion,
  SlashCommandDef,
  Workspace,
} from '../wire/types.js';

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
    const locale = this.options.getLocale?.();
    if (locale) {
      h['Accept-Language'] = locale;
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
    return this.request<T>(path, 'POST', body);
  }

  private async del<T = void>(path: string): Promise<T> {
    return this.request<T>(path, 'DELETE', undefined);
  }

  /**
   * Shared request helper used by POST/PATCH/PUT — `post()` delegates
   * here for back-compat with existing call sites.
   */
  private async request<T>(
    path: string,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      throw new HttpError(res.status, res.statusText, await res.text());
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  capabilities(): Promise<Capabilities> {
    return this.get<Capabilities>('/v1/capabilities');
  }

  sessions(options: { archived?: boolean } = {}): Promise<{ sessions: Session[] }> {
    const qs = new URLSearchParams();
    if (options.archived !== undefined) {
      qs.set('archived', String(options.archived));
    }
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.get<{ sessions: Session[] }>(`/v1/sessions${suffix}`);
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

  /** DELETE /v1/sessions/{id} — removes a session and returns 204. */
  deleteSession(sessionId: string): Promise<void> {
    return this.request<void>(
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
      'DELETE',
      undefined,
    );
  }

  /**
   * DELETE /v1/sessions/{sid}/messages/{id} — drop a single message.
   * Per-message surgical undo, distinct from `undoSession`'s tail trim.
   */
  deleteMessage(sessionId: string, messageId: string): Promise<void> {
    return this.request<void>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
      'DELETE',
      undefined,
    );
  }

  /**
   * POST /v1/sessions/import — recreate a session from its export
   * JSON blob. Returns the new Session. Companion to exportSession.
   */
  importSession(body: Record<string, unknown>): Promise<Session> {
    return this.post<Session>('/v1/sessions/import', body);
  }

  /**
   * GET /v1/sessions/{sid}/messages/search?q=… — backend-side full
   * text search. Returns relevance-scored hits. Use over client-side
   * substring once the transcript has more than a few hundred turns.
   */
  searchSessionMessages(
    sessionId: string,
    q: string,
  ): Promise<{ matches: Array<{
    message_id: string;
    part_id?: string;
    snippet: string;
    score?: number;
  }> }> {
    const qs = new URLSearchParams({ q }).toString();
    return this.get<{ matches: Array<{
      message_id: string;
      part_id?: string;
      snippet: string;
      score?: number;
    }> }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages/search?${qs}`,
    );
  }

  /**
   * GET /v1/memory/search?q=… — cross-session full-text search across
   * the whole workspace memory (PR #351). Optional session_id scope.
   */
  memorySearch(
    q: string,
    options: { session_id?: string; workspace_id?: string; limit?: number } = {},
  ): Promise<{
    query: string;
    hits: Array<{
      session_id: string;
      message_id: string;
      role?: string;
      text: string;
      score?: number;
      match_terms?: string[];
    }>;
  }> {
    const qs = new URLSearchParams({ q });
    if (options.session_id) qs.set('session_id', options.session_id);
    if (options.workspace_id) qs.set('workspace_id', options.workspace_id);
    if (options.limit) qs.set('limit', String(options.limit));
    return this.get(`/v1/memory/search?${qs}`);
  }

  /**
   * GET /v1/sessions/{id}/context/frames — the agent's time-series
   * memory snapshots for this session. Each frame represents a point
   * where the orchestrator persisted state. Used by the inspector's
   * Frames sub-section to give users a peek at the underlying memory
   * layer.
   */
  sessionContextFrames(
    sessionId: string,
  ): Promise<{
    frames: Array<{
      id: string;
      created_at?: string;
      status?: string;
      summary?: string;
      token_count?: number;
      [k: string]: unknown;
    }>;
  }> {
    return this.get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/context/frames`,
    );
  }

  /**
   * GET /v1/sessions/{id}/context/frames/{frame_id} — single-frame
   * detail (full payload, not just the summary that the list returns).
   */
  sessionContextFrame(
    sessionId: string,
    frameId: string,
  ): Promise<Record<string, unknown>> {
    return this.get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/context/frames/${encodeURIComponent(frameId)}`,
    );
  }

  /**
   * GET /v1/sessions/{id}/diffs — every proposed-but-not-applied diff
   * across the session. Used as a discovery entry point so the user
   * can see all pending diffs without scrolling the transcript.
   */
  sessionDiffs(
    sessionId: string,
  ): Promise<{
    diffs: Array<{
      path: string;
      applied?: boolean;
      message_id?: string;
      hunks?: Array<{ old_start?: number; old_lines?: number; new_start?: number; new_lines?: number; lines?: string[] }>;
      [k: string]: unknown;
    }>;
  }> {
    return this.get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/diffs`,
    );
  }

  /**
   * GET /v1/sessions/{id}/messages/{msg_id}/diffs — diffs scoped to a
   * single message (per-turn drill-down).
   */
  messageDiffs(
    sessionId: string,
    messageId: string,
  ): Promise<{
    diffs: Array<{
      path: string;
      applied?: boolean;
      [k: string]: unknown;
    }>;
  }> {
    return this.get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/diffs`,
    );
  }

  /**
   * POST /v1/sessions/{id}/commands/{cmd} — execute a slash command
   * via the structured route rather than dispatching it as a user
   * message. Preserves per-command argument schemas (a thing the
   * "send as user message and let the parser split it" path loses).
   */
  runCommand(
    sessionId: string,
    commandId: string,
    args: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return this.post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/commands/${encodeURIComponent(commandId)}`,
      args,
    );
  }

  /**
   * GET /v1/sessions/{id}/schedules — list cron-style triggers for
   * this session (PR #353 backend surface; SPEC §6.15 marks the
   * capability as optional).
   */
  sessionSchedules(
    sessionId: string,
  ): Promise<{
    schedules: Array<{
      id: string;
      cron?: string;
      next_run_at?: string;
      enabled?: boolean;
      prompt?: string;
      [k: string]: unknown;
    }>;
  }> {
    return this.get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/schedules`,
    );
  }

  /**
   * POST /v1/sessions/{id}/schedules — create a new cron trigger.
   */
  createSchedule(
    sessionId: string,
    body: { cron: string; prompt: string; enabled?: boolean },
  ): Promise<{ id: string; [k: string]: unknown }> {
    return this.post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/schedules`,
      body,
    );
  }

  /**
   * DELETE /v1/schedules/{id} — remove a cron trigger globally.
   */
  deleteSchedule(scheduleId: string): Promise<void> {
    return this.del(`/v1/schedules/${encodeURIComponent(scheduleId)}`);
  }

  /**
   * GET /v1/shared/{token} — load a read-only shared session view by
   * the share token a sender pasted into chat. Returns the static
   * transcript snapshot.
   */
  loadSharedSession(token: string): Promise<{
    session: Record<string, unknown>;
    messages: Array<Record<string, unknown>>;
  }> {
    return this.get(`/v1/shared/${encodeURIComponent(token)}`);
  }

  /**
   * GET /v1/sessions/{id}/memory/events — session-scoped memory event
   * audit log (cache hits, frame writes, tool invocations).
   */
  sessionMemoryEvents(
    sessionId: string,
    limit = 50,
  ): Promise<{ events: Array<Record<string, unknown>> }> {
    const qs = limit ? `?limit=${limit}` : '';
    return this.get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/memory/events${qs}`,
    );
  }

  /**
   * POST /v1/sessions/{id}/questions/{qid}/answer — resolve a pending
   * orchestrator question (#380). Body carries the user's reply (free
   * text for `freeform`, value for `choice` / `confirmation`).
   */
  answerSessionQuestion(
    sessionId: string,
    questionId: string,
    body: { answer?: string; selected_options?: string[] },
  ): Promise<UserQuestion> {
    return this.post<UserQuestion>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/answer`,
      body,
    );
  }

  /**
   * POST /v1/sessions/{id}/questions/{qid}/cancel — abort a pending
   * orchestrator question.
   */
  cancelSessionQuestion(
    sessionId: string,
    questionId: string,
  ): Promise<UserQuestion> {
    return this.post<UserQuestion>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/cancel`,
      {},
    );
  }

  /**
   * GET /v1/sessions/{id}/questions — pending ask-user questions
   * from the orchestrator (#380). Defaults to all statuses.
   */
  sessionQuestions(
    sessionId: string,
    status?: UserQuestion['status'],
  ): Promise<{ questions: UserQuestion[] }> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.get<{ questions: UserQuestion[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/questions${qs}`,
    );
  }

  /**
   * GET /v1/sessions/{id}/context/files — the file index the agent
   * has been asked to keep in context for this session. Per
   * clio-agent develop #362.
   */
  sessionContextFiles(sessionId: string): Promise<{ files: ContextFile[] }> {
    return this.get<{ files: ContextFile[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/context/files`,
    );
  }

  /**
   * POST /v1/sessions/{id}/context/files — attach a file to the
   * session's context. Existing rows for the same path are upserted.
   */
  addContextFile(
    sessionId: string,
    body: { path: string; mode?: string; language?: string },
  ): Promise<ContextFile> {
    return this.post<ContextFile>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/context/files`,
      body,
    );
  }

  /**
   * DELETE /v1/sessions/{id}/context/files?path=… — drop a file
   * from the session's context.
   */
  removeContextFile(sessionId: string, path: string): Promise<void> {
    const qs = new URLSearchParams({ path }).toString();
    return this.request<void>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/context/files?${qs}`,
      'DELETE',
      undefined,
    );
  }

  /**
   * GET /v1/sessions/{id}/tasks — list the lightweight TODO entries
   * scoped to a session (clio-agent develop).
   */
  sessionTasks(sessionId: string): Promise<{ tasks: SessionTask[] }> {
    return this.get<{ tasks: SessionTask[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/tasks`,
    );
  }

  /**
   * POST /v1/sessions/{id}/tasks — create a session task.
   */
  createSessionTask(
    sessionId: string,
    body: { title: string; status?: SessionTask['status'] },
  ): Promise<SessionTask> {
    return this.post<SessionTask>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/tasks`,
      body,
    );
  }

  /**
   * PATCH /v1/tasks/{tid} — update a session task. Pass any subset of
   * {title, status, metadata}.
   */
  patchSessionTask(
    taskId: string,
    patch: Partial<Pick<SessionTask, 'title' | 'status' | 'metadata'>>,
  ): Promise<SessionTask> {
    return this.request<SessionTask>(
      `/v1/tasks/${encodeURIComponent(taskId)}`,
      'PATCH',
      patch,
    );
  }

  /**
   * DELETE /v1/tasks/{tid} — remove a session task.
   */
  deleteSessionTask(taskId: string): Promise<void> {
    return this.request<void>(
      `/v1/tasks/${encodeURIComponent(taskId)}`,
      'DELETE',
      undefined,
    );
  }

  /**
   * POST /v1/sessions/{id}/undo — drops the last N messages from the
   * session (default 1). Per clio-agent develop turn-rollback work.
   * Returns the rollback envelope {kept_messages, deleted_messages}.
   */
  undoSession(
    sessionId: string,
    body: { count?: number } = {},
  ): Promise<{ kept_messages?: unknown[]; deleted_messages?: unknown[] }> {
    return this.post<{ kept_messages?: unknown[]; deleted_messages?: unknown[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/undo`,
      body,
    );
  }

  /**
   * POST /v1/sessions/{id}/rewind — drops every message after the
   * given target_message_id (and the target itself if include_target).
   * Useful for "back up two turns and try again" workflows.
   */
  rewindSession(
    sessionId: string,
    body: { message_id: string; include_target?: boolean },
  ): Promise<{ kept_messages?: unknown[]; deleted_messages?: unknown[] }> {
    return this.post<{ kept_messages?: unknown[]; deleted_messages?: unknown[] }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/rewind`,
      body,
    );
  }

  /**
   * POST /v1/sessions/{id}/compact — collapses earlier conversation
   * into a compacted summary to free up context window. Per
   * clio-agent develop. 204 on success — `session.compacted` event
   * fires asynchronously when done.
   */
  compactSession(
    sessionId: string,
    body: { reason?: string } = {},
  ): Promise<void> {
    return this.post<void>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/compact`,
      body,
    );
  }

  /**
   * POST /v1/sessions/{id}/summarize — kicks off async summarization.
   * The result lands on the SSE stream as a `session.summarized`
   * event (per SPEC §7.3). 204 on success — no body returned.
   */
  summarizeSession(
    sessionId: string,
    body: { auto?: boolean; instructions?: string } = {},
  ): Promise<void> {
    return this.post<void>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/summarize`,
      body,
    );
  }

  /**
   * GET /v1/sessions/{id}/export — full session payload as JSON
   * (messages, metadata, agent + model + workspace IDs). Used for
   * 'Export as JSON' downloads from the session kebab menu.
   */
  exportSession(sessionId: string): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/export`,
    );
  }

  /**
   * POST /v1/sessions/{id}/fork — branch the session at its current
   * tail (or at a specific message). Returns the new Session.
   */
  forkSession(
    sessionId: string,
    body: { title?: string; from_message_id?: string } = {},
  ): Promise<Session> {
    return this.post<Session>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/fork`,
      body,
    );
  }

  /**
   * POST /v1/sessions/{id}/share — create a read-only share. Returns
   * the share token + URL the user can hand to anyone.
   */
  shareSession(
    sessionId: string,
    body: { expires_in_seconds?: number } = {},
  ): Promise<{ token: string; url?: string; expires_at?: string }> {
    return this.post<{
      token: string;
      url?: string;
      expires_at?: string;
    }>(`/v1/sessions/${encodeURIComponent(sessionId)}/share`, body);
  }

  /**
   * PATCH /v1/sessions/{id} — update session metadata (title, model,
   * agent mode, archived). Used by the composer's model picker + perm
   * mode toggle to push the user's selection to the backend.
   */
  patchSession(
    sessionId: string,
    patch: {
      title?: string;
      archived?: boolean;
      agent?: { id?: string; mode?: string };
      model?: { provider_id?: string; model_id?: string };
      /** Free-form metadata bag. Used for session pinning (key
       * `pinned: boolean`) so that pin state is coherent across the
       * TUI and the Desktop. */
      metadata?: Record<string, unknown>;
    },
  ): Promise<Session> {
    return this.request<Session>(
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
      'PATCH',
      patch,
    );
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

  /* -------- Discovery endpoints (Wave 0.9.1: LeftRail backing) -------- */

  workspaces(): Promise<{ workspaces: Workspace[] }> {
    return this.get<{ workspaces: Workspace[] }>('/v1/workspaces');
  }

  /**
   * GET /v1/workspaces/{id}/files — list the file tree (paginated by
   * cursor). Used to back the composer `@`-mention picker.
   */
  workspaceFiles(
    workspaceId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<{
    files: Array<{ path: string; size?: number; language?: string; mime?: string }>;
    next_cursor?: string;
  }> {
    const qs = new URLSearchParams();
    if (options.cursor) qs.set('cursor', options.cursor);
    if (options.limit) qs.set('limit', String(options.limit));
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}/files${suffix}`);
  }

  /**
   * GET /v1/workspaces/{id}/files/read?path=… — read a single file's
   * text content. Used to preview an `@`-mention before sending.
   */
  workspaceReadFile(
    workspaceId: string,
    path: string,
  ): Promise<{ path: string; content: string; mime?: string; size?: number }> {
    const qs = new URLSearchParams({ path }).toString();
    return this.get(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/files/read?${qs}`,
    );
  }

  /**
   * GET /v1/workspaces/{id}/repo_map — indexed tree + per-file token
   * estimates. Useful for an "overview" panel.
   */
  workspaceRepoMap(
    workspaceId: string,
  ): Promise<{ tree?: Record<string, unknown>; tokens?: number }> {
    return this.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}/repo_map`);
  }

  /**
   * POST /v1/workspaces — register a new workspace root.
   * Per SPEC §6.1 only `root_path` is required; the backend chooses
   * an `id` and creates the on-disk metadata directory.
   */
  createWorkspace(body: {
    root_path: string;
    name?: string;
    config?: Record<string, unknown>;
  }): Promise<Workspace> {
    return this.post<Workspace>('/v1/workspaces', body);
  }

  agents(): Promise<{ agents: AgentDef[] }> {
    return this.get<{ agents: AgentDef[] }>('/v1/agents');
  }

  providers(): Promise<{ providers: ProviderDef[] }> {
    return this.get<{ providers: ProviderDef[] }>('/v1/providers');
  }

  /**
   * GET /v1/providers/{id} — single-provider detail (more fields than
   * the bulk list — includes vendor metadata, status, auth flow, and
   * deprecation hints). Used by the ProvidersPage card expansion.
   */
  getProvider(
    providerId: string,
  ): Promise<{
    id: string;
    name?: string;
    vendor?: string;
    status?: string;
    auth?: { kind?: string; required?: boolean; supports?: string[] };
    default_model?: string;
    metadata?: Record<string, unknown>;
    [k: string]: unknown;
  }> {
    return this.get(`/v1/providers/${encodeURIComponent(providerId)}`);
  }

  /**
   * GET /v1/providers/{id}/models — the detailed model list for a
   * provider. Source field distinguishes built-in vs. discovered;
   * Error field surfaces per-model issues (deprecated, throttled, …).
   */
  providerModels(
    providerId: string,
    apiBase?: string,
  ): Promise<{
    models: Array<{
      id: string;
      label?: string;
      source?: 'builtin' | 'discovered' | string;
      error?: string;
      context_length?: number;
      cost_usd_per_M_tokens?: number;
    }>;
  }> {
    const qs = new URLSearchParams();
    if (apiBase) qs.set('api_base', apiBase);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.get(`/v1/providers/${encodeURIComponent(providerId)}/models${suffix}`);
  }

  mcpServers(): Promise<{ servers: McpServerInfo[] }> {
    return this.get<{ servers: McpServerInfo[] }>('/v1/mcp/servers');
  }

  /**
   * POST /v1/mcp/servers — register a new MCP server. Transport-shaped:
   * `{name, transport: 'stdio', command, args?, env?}` or
   * `{name, transport: 'sse' | 'http', url}`. Returns the new server.
   */
  installMcpServer(body: {
    name: string;
    transport: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  }): Promise<McpServerInfo> {
    return this.post<McpServerInfo>('/v1/mcp/servers', body);
  }

  /** DELETE /v1/mcp/servers/{id} — uninstall an MCP server. */
  uninstallMcpServer(serverId: string): Promise<void> {
    return this.request<void>(
      `/v1/mcp/servers/${encodeURIComponent(serverId)}`,
      'DELETE',
      undefined,
    );
  }

  /** POST /v1/mcp/servers/{id}/reconnect — force a reconnect attempt. */
  reconnectMcpServer(serverId: string): Promise<{ status?: string; error?: string }> {
    return this.post<{ status?: string; error?: string }>(
      `/v1/mcp/servers/${encodeURIComponent(serverId)}/reconnect`,
      {},
    );
  }

  /**
   * GET /v1/mcp/servers/{id}/tools — list the tools exposed by an MCP
   * server. Used by the per-server detail view.
   */
  mcpServerTools(serverId: string): Promise<{ tools: Array<{
    name: string;
    description?: string;
    schema?: Record<string, unknown>;
  }> }> {
    return this.get(`/v1/mcp/servers/${encodeURIComponent(serverId)}/tools`);
  }

  /** GET /v1/mcp/servers/{id}/resources — list MCP resources. */
  mcpServerResources(serverId: string): Promise<{ resources: Array<{
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
  }> }> {
    return this.get(`/v1/mcp/servers/${encodeURIComponent(serverId)}/resources`);
  }

  /** GET /v1/mcp/servers/{id}/prompts — list MCP prompt templates. */
  mcpServerPrompts(serverId: string): Promise<{ prompts: Array<{
    name: string;
    description?: string;
  }> }> {
    return this.get(`/v1/mcp/servers/${encodeURIComponent(serverId)}/prompts`);
  }

  /**
   * POST /v1/mcp/servers/{id}/resources/read — fetch an MCP resource
   * by URI. Used for inspecting what an MCP server exposes.
   */
  mcpReadResource(
    serverId: string,
    uri: string,
  ): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }> {
    return this.post(
      `/v1/mcp/servers/${encodeURIComponent(serverId)}/resources/read`,
      { uri },
    );
  }

  health(): Promise<HealthSnapshot> {
    return this.get<HealthSnapshot>('/v1/health');
  }

  /**
   * GET /v1/capability-gaps — backend's self-declared "intentionally
   * unsupported" or "future" capabilities. Per clio-agent develop
   * (#353 capability-gap-metadata). Keys are capability names; values
   * carry status/advertised/category/description metadata.
   */
  capabilityGaps(): Promise<{
    capability_gaps: Record<string, Record<string, unknown>>;
  }> {
    return this.get<{
      capability_gaps: Record<string, Record<string, unknown>>;
    }>('/v1/capability-gaps');
  }

  memoryStats(): Promise<MemoryStats> {
    return this.get<MemoryStats>('/v1/memory/stats');
  }

  metrics(): Promise<MetricsSnapshot> {
    return this.get<MetricsSnapshot>('/v1/metrics');
  }

  commands(): Promise<{ commands: SlashCommandDef[] }> {
    return this.get<{ commands: SlashCommandDef[] }>('/v1/commands');
  }

  /**
   * GET /v1/prompts — list registered prompt definitions across all
   * scopes (builtin / user / workspace). Per clio-agent develop PRs
   * #376/#377. Optional session_id/workspace_id scope the listing.
   */
  prompts(
    scope: { session_id?: string; workspace_id?: string } = {},
  ): Promise<{ prompts: PromptDef[]; sources: PromptSource[] }> {
    const qs = new URLSearchParams();
    if (scope.session_id) qs.set('session_id', scope.session_id);
    if (scope.workspace_id) qs.set('workspace_id', scope.workspace_id);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.get<{ prompts: PromptDef[]; sources: PromptSource[] }>(
      `/v1/prompts${suffix}`,
    );
  }

  /**
   * GET /v1/prompts/{id} — resolve a prompt to its rendered text
   * (default profile, optionally overridden via profile query param).
   * Returns `{prompt: {id, profile, text, ...}}`.
   */
  getPrompt(
    promptId: string,
    options: { profile?: string; session_id?: string; workspace_id?: string } = {},
  ): Promise<{
    prompt: {
      id: string;
      profile: string;
      text: string;
      title?: string;
      description?: string;
      scope?: string;
      source_path?: string;
      provider?: string;
      model?: string;
      checksum?: string;
    };
  }> {
    const qs = new URLSearchParams();
    if (options.profile) qs.set('profile', options.profile);
    if (options.session_id) qs.set('session_id', options.session_id);
    if (options.workspace_id) qs.set('workspace_id', options.workspace_id);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.get(`/v1/prompts/${encodeURIComponent(promptId)}${suffix}`);
  }

  /**
   * POST /v1/prompts/reload — re-scan the prompt sources for new or
   * changed files. Useful after the user edits a prompt on disk.
   */
  reloadPrompts(): Promise<unknown> {
    return this.post<unknown>('/v1/prompts/reload', {});
  }

  /**
   * GET /v1/providers/lm — the currently-active LM config (provider,
   * api_base, model, temperature, …).
   */
  lmConfig(): Promise<LmConfigSnapshot> {
    return this.get<LmConfigSnapshot>('/v1/providers/lm');
  }

  /**
   * PUT /v1/providers/lm — swap the active LM at runtime. Drives the
   * "Use as LM" button on each provider card in Settings → Providers.
   */
  setLm(body: {
    provider: string;
    api_base: string;
    model: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<LmConfigSnapshot> {
    return this.request<LmConfigSnapshot>('/v1/providers/lm', 'PUT', body);
  }

  /**
   * POST /v1/providers/{id}/auth — trigger the provider's auth flow
   * (e.g. opens the ALCF Globus login window). Returns the current
   * auth state so the UI can refresh the "authenticated" pill.
   */
  authProvider(providerId: string): Promise<{
    is_authenticated: boolean;
    provider_id: string;
    instructions?: string;
  }> {
    return this.post<{
      is_authenticated: boolean;
      provider_id: string;
      instructions?: string;
    }>(`/v1/providers/${encodeURIComponent(providerId)}/auth`, {});
  }

  /**
   * GET /v1/policies — the global + workspace policy that governs
   * tool / command / memory autonomy. PR #378 added the
   * `command.agent_invocable` gate.
   */
  policies(): Promise<{ policies: Record<string, unknown> }> {
    return this.get('/v1/policies');
  }

  /** PUT /v1/policies — replace the policy document. */
  putPolicies(body: Record<string, unknown>): Promise<unknown> {
    return this.request<unknown>('/v1/policies', 'PUT', body);
  }

  /** GET /v1/hooks — list registered pre/post handler URIs. */
  hooks(): Promise<{ hooks: Array<{
    id: string;
    type: 'pre_message' | 'post_message' | 'pre_tool' | 'post_tool' | string;
    handler_uri: string;
    metadata?: Record<string, unknown>;
  }> }> {
    return this.get('/v1/hooks');
  }

  /** POST /v1/hooks — register a new hook. */
  createHook(body: {
    type: 'pre_message' | 'post_message' | 'pre_tool' | 'post_tool' | string;
    handler_uri: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    id: string;
    type: string;
    handler_uri: string;
    metadata?: Record<string, unknown>;
  }> {
    return this.post('/v1/hooks', body);
  }

  /** DELETE /v1/hooks/{id} — remove a hook. */
  deleteHook(hookId: string): Promise<void> {
    return this.del(`/v1/hooks/${encodeURIComponent(hookId)}`);
  }

  /** GET /v1/agents/{id} — single-agent detail (richer than the bulk
   * list — includes routing rules, tools, default model). */
  getAgent(agentId: string): Promise<AgentDef & {
    [k: string]: unknown;
  }> {
    return this.get(`/v1/agents/${encodeURIComponent(agentId)}`);
  }

  /** POST /v1/agent-blueprints/validate — dry-run validate a blueprint
   * document before installing. Returns `{ ok, errors? }`. */
  validateAgentBlueprint(body: Record<string, unknown>): Promise<{
    ok: boolean;
    errors?: string[];
  }> {
    return this.post('/v1/agent-blueprints/validate', body);
  }

  /** POST /v1/agent-blueprints — install a blueprint document. */
  installAgentBlueprint(body: Record<string, unknown>): Promise<{
    id: string;
    [k: string]: unknown;
  }> {
    return this.post('/v1/agent-blueprints', body);
  }

  /** DELETE /v1/agent-blueprints/{bp} — uninstall a blueprint. */
  uninstallAgentBlueprint(blueprintId: string): Promise<void> {
    return this.del(
      `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}`,
    );
  }

  /** GET /v1/agent-blueprints — list registered agent blueprints (PR #386/#387). */
  agentBlueprints(): Promise<{ blueprints: Array<{
    id: string;
    name?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }> }> {
    return this.get('/v1/agent-blueprints');
  }

  /** GET /v1/sessions/{id}/agent-blueprint — currently-bound blueprint
   * for a session (PR #386/#387). */
  getSessionBlueprint(
    sessionId: string,
  ): Promise<{ blueprint_id?: string | null; [k: string]: unknown }> {
    return this.get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/agent-blueprint`,
    );
  }

  /** POST /v1/sessions/{id}/agent-blueprint — bind a blueprint to the
   * session. Pass `blueprint_id: null` to clear. */
  setSessionBlueprint(
    sessionId: string,
    body: { blueprint_id: string | null },
  ): Promise<unknown> {
    return this.post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/agent-blueprint`,
      body,
    );
  }

  /** GET /v1/sessions/{id}/expert-pack — currently-bound expert pack. */
  getSessionExpertPack(
    sessionId: string,
  ): Promise<{ pack_id?: string | null; [k: string]: unknown }> {
    return this.get(
      `/v1/sessions/${encodeURIComponent(sessionId)}/expert-pack`,
    );
  }

  /** POST /v1/sessions/{id}/expert-pack — bind a pack. */
  setSessionExpertPack(
    sessionId: string,
    body: { pack_id: string | null },
  ): Promise<unknown> {
    return this.post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/expert-pack`,
      body,
    );
  }

  /** POST /v1/expert-packs/validate — dry-run validate a pack JSON. */
  validateExpertPack(body: Record<string, unknown>): Promise<{
    ok: boolean;
    errors?: string[];
  }> {
    return this.post('/v1/expert-packs/validate', body);
  }

  /** GET /v1/expert-packs — list installed expert packs (PR #344/#376). */
  expertPacks(): Promise<{ packs: Array<{
    id: string;
    name?: string;
    description?: string;
    runtime_scope?: string;
    metadata?: Record<string, unknown>;
  }> }> {
    return this.get('/v1/expert-packs');
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
