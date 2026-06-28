import type { PermissionScope, TurnAttempt } from '../wire/types.js';
import type { HttpTransport } from './transport.js';
import type {
  CompactSessionInput,
  RewindSessionInput,
  RetryTurnInput,
  RollbackSessionInput,
  RollbackSessionResult,
  RunCommandArgs,
  RunCommandResult,
  SessionAttemptsResult,
  SessionPermissionsResult,
  SummarizeSessionInput,
} from './session_run_types.js';

export * from './session_run_types.js';

type SessionRunTransport = Pick<HttpTransport, 'get' | 'post' | 'request'>;

export function permissionAction(
  decision: 'approve' | 'deny',
  scope?: PermissionScope,
): 'allow' | 'deny' | 'allow_session' | 'allow_workspace' {
  // Wire: clio reads { action: 'allow' | 'deny' | 'allow_session' |
  // 'allow_workspace' }. Map the UI's decision+scope to the
  // backend's single enum so permissions actually unblock the agent.
  if (decision !== 'approve') return 'deny';
  if (scope === 'session') return 'allow_session';
  // `always_tool` / `always_server` aren't first-class on clio yet;
  // map both to allow_workspace which is the broadest scope clio
  // currently honors.
  if (scope === 'always_tool' || scope === 'always_server') {
    return 'allow_workspace';
  }
  return 'allow';
}

export function runSessionCommand(
  client: SessionRunTransport,
  sessionId: string,
  commandId: string,
  args: RunCommandArgs = {},
): Promise<RunCommandResult> {
  // clio's /v1/commands lists ids with a leading slash (e.g.
  // "/cache-stats"), but the command endpoint keys on the bare name
  // ("cache-stats"). Posting the id verbatim yields "%2Fcache-stats"
  // -> 404, so no backend slash command ever dispatched. Strip it.
  const cmd = commandId.replace(/^\/+/, '');
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/commands/${encodeURIComponent(cmd)}`,
    args,
  );
}

export function undoSessionMessages(
  client: SessionRunTransport,
  sessionId: string,
  body: RollbackSessionInput = {},
): Promise<RollbackSessionResult> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/undo`,
    body,
  );
}

export function rewindSessionMessages(
  client: SessionRunTransport,
  sessionId: string,
  body: RewindSessionInput,
): Promise<RollbackSessionResult> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/rewind`,
    body,
  );
}

export function compactSessionMessages(
  client: SessionRunTransport,
  sessionId: string,
  body: CompactSessionInput = {},
): Promise<void> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/compact`,
    body,
  );
}

export function summarizeSessionMessages(
  client: SessionRunTransport,
  sessionId: string,
  body: SummarizeSessionInput = {},
): Promise<void> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/summarize`,
    body,
  );
}

export function retrySessionTurn(
  client: SessionRunTransport,
  sessionId: string,
  messageId: string,
  body: RetryTurnInput = {},
): Promise<TurnAttempt> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/retry`,
    body,
  );
}

export function fetchSessionAttempts(
  client: SessionRunTransport,
  sessionId: string,
): Promise<SessionAttemptsResult> {
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/attempts`,
  );
}

export function fetchSessionPermissions(
  client: SessionRunTransport,
  sessionId: string,
): Promise<SessionPermissionsResult> {
  const qs = new URLSearchParams({ session_id: sessionId }).toString();
  return client.get(`/v1/permissions?${qs}`);
}

export function resolveSessionPermission(
  client: SessionRunTransport,
  permissionId: string,
  decision: 'approve' | 'deny',
  scope?: PermissionScope,
): Promise<void> {
  return client.post(`/v1/permissions/${encodeURIComponent(permissionId)}`, {
    action: permissionAction(decision, scope),
  });
}

export function cancelSessionRun(
  client: SessionRunTransport,
  sessionId: string,
): Promise<void> {
  return client.post(`/v1/sessions/${encodeURIComponent(sessionId)}/cancel`, {});
}
