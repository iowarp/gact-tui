import { z } from 'zod';
import { ResponseFeedbackRepository } from './response-feedback-repository.js';

const coreReferenceSchema = z.object({
  session_id: z.string(),
  scope: z.string(),
  content_id: z.string(),
  sha256: z.string(),
});

export const taskSnapshotSchema = z.object({
  handle: z.string(),
  kind: z.enum(['Session', 'Subagent', 'Shell', 'Download', 'Indexing', 'MCP', 'Question']),
  owner: z.object({
    human_id: z.string(),
    session_id: z.string(),
    assignment_id: z.string(),
    parent_handle: z.string().nullable(),
  }),
  label: z.string(),
  description: z.string().nullable(),
  description_missing: z.boolean(),
  description_reference: coreReferenceSchema.nullable(),
  tool: z.string(),
  invocation_id: z.string(),
  status: z.string(),
  raw_status: z.string(),
  activity: z.string(),
  progress: z.object({
    message: z.string(),
    completed: z.number().nullable(),
    total: z.number().nullable(),
    unit: z.string(),
    output: coreReferenceSchema.nullable(),
  }),
  supported_actions: z.array(z.string()),
  cancellation_requested_at: z.string().nullable(),
  terminal_at: z.string().nullable(),
  connection_freshness: z.string(),
  settlement: z.string(),
  recording: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  result: coreReferenceSchema.nullable(),
  details: coreReferenceSchema.nullable(),
  backend: z
    .object({
      owner: z.string(),
      server: z.string(),
      auth_scope: z.string(),
      session: z.string(),
      task_id: z.string(),
      queue: z.string(),
      execution_key: z.string(),
      transport: z.string(),
      placement: z.string(),
    })
    .nullable(),
});

const taskPageSchema = z.object({
  tasks: z.array(taskSnapshotSchema),
  total: z.number().int().nullable(),
  cursor: z.string().nullable(),
  revision: z.number().int(),
});

export type TaskSnapshot = z.infer<typeof taskSnapshotSchema>;
export type TaskPage = z.infer<typeof taskPageSchema>;

const cancellationReply = z.object({
  results: z.array(
    z.object({ handle: z.string(), cancellation_requested: z.boolean(), status: z.string() }),
  ),
  errors: z.array(z.object({ handle: z.string(), error: z.string() })),
});

const coordinationGrant = z.object({
  id: z.string(),
  granting_human: z.string(),
  recipient_session: z.string(),
  target_session: z.string(),
  target_handle: z.string().nullish(),
  target_scope: z.enum(['session', 'tree']),
  rights: z.array(z.enum(['read', 'observe', 'message', 'control'])),
  created_at: z.string(),
  revoked_at: z.string().nullish(),
});

export type SessionCoordinationGrant = z.infer<typeof coordinationGrant>;
export type SessionCoordinationRight = SessionCoordinationGrant['rights'][number];

/** Shared task controls use their original owner and report per-handle failures. */
export class TaskRepository extends ResponseFeedbackRepository {
  /** One paginated Core snapshot of the authenticated human's work across sessions. */
  public queryTasks(
    options: {
      cursor?: string;
      kind?: TaskSnapshot['kind'];
      activeOnly?: boolean;
      limit?: number;
    } = {},
    signal?: AbortSignal,
  ): Promise<TaskPage> {
    const query = new URLSearchParams({ limit: String(options.limit ?? 50) });
    if (options.cursor) query.set('cursor', options.cursor);
    if (options.kind) query.set('kind', options.kind);
    if (options.activeOnly) query.set('active_only', 'true');
    return this.transport.request({
      method: 'GET',
      path: `/v1/tasks/query?${query}`,
      decode: (value) => taskPageSchema.parse(value),
      signal,
    });
  }
  /** Human-only relationship controls use the authenticated service channel. */
  public async coordinationGrants(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<SessionCoordinationGrant[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/coordination-grants`,
      decode: (value) => z.object({ grants: z.array(coordinationGrant) }).parse(value),
      signal,
    });
    return result.grants;
  }

  public async grantSessionAccess(
    sessionId: string,
    targetSession: string,
    rights: SessionCoordinationRight[],
    includeDescendants = false,
    signal?: AbortSignal,
  ): Promise<SessionCoordinationGrant> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/coordination-grants`,
      body: {
        recipient_session: sessionId,
        target_session: targetSession,
        rights,
        target_scope: includeDescendants ? 'tree' : 'session',
      },
      decode: (value) => coordinationGrant.parse(value),
      signal,
    });
  }

  public async revokeSessionAccess(
    sessionId: string,
    grantId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.transport.request({
      method: 'DELETE',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/coordination-grants/${encodeURIComponent(grantId)}`,
      decode: (value) => coordinationGrant.parse(value),
      signal,
    });
  }

  public async controlSubagent(
    sessionId: string,
    target: string,
    action: 'pause' | 'resume' | 'restart',
    signal?: AbortSignal,
  ): Promise<void> {
    await this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/agent-controls/${encodeURIComponent(target)}/${action}`,
      body: { fresh: false },
      decode: (value) =>
        z.object({ handle: z.string(), session_id: z.string(), status: z.string() }).parse(value),
      signal,
    });
  }

  public async cancelTasks(
    sessionId: string,
    tasks: string[],
    signal?: AbortSignal,
  ): Promise<void> {
    const result = await this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/async-tasks/cancel`,
      body: { tasks },
      decode: (value) => cancellationReply.parse(value),
      signal,
    });
    if (result.errors.length)
      throw new Error(result.errors.map((error) => `${error.handle}: ${error.error}`).join('; '));
  }
}
