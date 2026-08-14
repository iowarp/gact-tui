import type { Session } from '../wire/types.js';
import type { SessionTransport } from './session_transport.js';

export interface SessionsOptions {
  archived?: boolean;
  workspace_id?: string;
  include_all_workspaces?: boolean;
}

export interface SessionsResult {
  sessions: Session[];
}

export interface CreateSessionInput {
  title?: string;
  workspace_id?: string;
}

export type ImportSessionInput = Record<string, unknown>;

export type ExportSessionResult = Record<string, unknown>;

export interface SharedSessionResult {
  session: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
}

export interface ForkSessionInput {
  title?: string;
  from_message_id?: string;
}

export interface ShareSessionInput {
  expires_in_seconds?: number;
}

export interface ShareSessionResult {
  token: string;
  url?: string;
  expires_at?: string;
}

export interface PatchSessionInput {
  title?: string;
  archived?: boolean;
  agent?: { id?: string; mode?: string };
  model?: { provider_id?: string; model_id?: string; variant?: string };
  /**
   * The approval axis (clio-agent #1034), orthogonal to `mode`. Mirrors the
   * wire Literal in gact/types.py: UpdateSessionRequest.approval_mode.
   */
  approval_mode?: 'ask' | 'auto-edits' | 'bypass' | 'ai-review' | 'spotter-ai';
  mode?: 'plan' | 'edit' | 'architect';
  edit_mode?: 'diff' | 'whole' | 'patch';
  routing_mode?: 'auto' | 'chat' | 'experts' | 'reasoning_only';
  /** Free-form metadata bag. Used for session pinning across frontends. */
  metadata?: Record<string, unknown>;
}

export function forkSessionPayload(body: ForkSessionInput): Record<string, unknown> {
  // Wire wants `at_message_id`; callers think in `from_message_id`.
  const { from_message_id, ...rest } = body;
  const payload: Record<string, unknown> = { ...rest };
  if (from_message_id) payload['at_message_id'] = from_message_id;
  return payload;
}

export function shareSessionPayload(body: ShareSessionInput): Record<string, unknown> {
  // Wire wants `ttl_s`; callers think in `expires_in_seconds`.
  const payload: Record<string, unknown> = {};
  if (typeof body.expires_in_seconds === 'number') {
    payload['ttl_s'] = body.expires_in_seconds;
  }
  return payload;
}

export function fetchSession(client: SessionTransport, sessionId: string): Promise<Session> {
  return client.get(`/v1/sessions/${encodeURIComponent(sessionId)}`);
}

export function fetchSessions(
  client: SessionTransport,
  options: SessionsOptions = {},
): Promise<SessionsResult> {
  const qs = new URLSearchParams();
  if (options.archived !== undefined) {
    qs.set('archived', String(options.archived));
  }
  if (options.workspace_id) {
    qs.set('workspace_id', options.workspace_id);
  }
  if (options.include_all_workspaces !== undefined) {
    qs.set('include_all_workspaces', String(options.include_all_workspaces));
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return client.get(`/v1/sessions${suffix}`);
}

export function createSessionRecord(
  client: SessionTransport,
  input: CreateSessionInput = {},
): Promise<Session> {
  return client.post('/v1/sessions', input);
}

export function removeSession(client: SessionTransport, sessionId: string): Promise<void> {
  return client.request(`/v1/sessions/${encodeURIComponent(sessionId)}`, 'DELETE', undefined);
}

export function importSessionRecord(
  client: SessionTransport,
  body: ImportSessionInput,
): Promise<Session> {
  return client.post('/v1/sessions/import', body);
}

export function fetchSharedSession(
  client: SessionTransport,
  token: string,
): Promise<SharedSessionResult> {
  return client.get(`/v1/shared/${encodeURIComponent(token)}`);
}

export function exportSessionRecord(
  client: SessionTransport,
  sessionId: string,
): Promise<ExportSessionResult> {
  return client.get(`/v1/sessions/${encodeURIComponent(sessionId)}/export`);
}

export function forkSessionRecord(
  client: SessionTransport,
  sessionId: string,
  body: ForkSessionInput = {},
): Promise<Session> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/fork`,
    forkSessionPayload(body),
  );
}

export function shareSessionRecord(
  client: SessionTransport,
  sessionId: string,
  body: ShareSessionInput = {},
): Promise<ShareSessionResult> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/share`,
    shareSessionPayload(body),
  );
}

export function patchSessionRecord(
  client: SessionTransport,
  sessionId: string,
  patch: PatchSessionInput,
): Promise<Session> {
  return client.request(`/v1/sessions/${encodeURIComponent(sessionId)}`, 'PATCH', patch);
}
