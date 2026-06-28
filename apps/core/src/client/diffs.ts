import type { HttpTransport } from './transport.js';

type DiffTransport = Pick<HttpTransport, 'get' | 'post'>;

export interface DiffScopeInput {
  paths?: string[];
}

export interface ApplySessionDiffsResult {
  applied: string[];
  write_errors?: Record<string, string>;
}

export interface RejectSessionDiffsResult {
  rejected: string[];
}

export interface DiffHunk {
  old_start?: number;
  old_lines?: number;
  new_start?: number;
  new_lines?: number;
  lines?: string[];
}

export interface SessionDiffRow {
  path: string;
  applied?: boolean;
  message_id?: string;
  hunks?: DiffHunk[];
  [k: string]: unknown;
}

export interface SessionDiffsResult {
  diffs: SessionDiffRow[];
}

export interface MessageDiffRow {
  path: string;
  applied?: boolean;
  [k: string]: unknown;
}

export interface MessageDiffsResult {
  diffs: MessageDiffRow[];
}

export function applyDiffs(
  client: DiffTransport,
  sessionId: string,
  body: DiffScopeInput = {},
): Promise<ApplySessionDiffsResult> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/diffs/apply`,
    body,
  );
}

export function rejectDiffs(
  client: DiffTransport,
  sessionId: string,
  body: DiffScopeInput = {},
): Promise<RejectSessionDiffsResult> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/diffs/reject`,
    body,
  );
}

export function fetchSessionDiffs(
  client: DiffTransport,
  sessionId: string,
): Promise<SessionDiffsResult> {
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/diffs`,
  );
}

export function fetchMessageDiffs(
  client: DiffTransport,
  sessionId: string,
  messageId: string,
): Promise<MessageDiffsResult> {
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/diffs`,
  );
}
