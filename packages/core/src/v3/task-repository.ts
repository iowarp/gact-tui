import { z } from 'zod';
import { flowQuestionsPath, flowRunSchema, type FlowRun } from './flow-run-domain.js';
import { MemoryRepository } from './memory-repository.js';
import { TransportError } from './transport.js';
import { readScienceLog, type ScienceLog } from './science-log.js';
import { readTransformRecord, type TransformRecord } from './transform-record.js';
import type { PendingInteraction } from './interaction-domain.js';
import { pendingInteractionListSchema } from './repository-decoders.js';

const coreReferenceSchema = z.object({
  session_id: z.string(),
  scope: z.string(),
  content_id: z.string(),
  sha256: z.string(),
});

export const taskSnapshotSchema = z.object({
  handle: z.string(),
  kind: z.enum(['Session', 'Subagent', 'Shell', 'Download', 'Indexing', 'MCP', 'Question', 'Code']),
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
  /** Namespaced facts the task's server sent with its status (`_meta`), passed through. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
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

const messageAssignmentSchema = z.object({
  metadata: z
    .object({
      recipient_input: z.object({ assignment_id: z.string() }).nullable().optional(),
    })
    .optional(),
});

const taskPageSchema = z.object({
  tasks: z.array(taskSnapshotSchema),
  total: z.number().int().nullable(),
  cursor: z.string().nullable(),
  revision: z.number().int(),
});

/** Just the fields a step's details show: the task's name and the full text it was given. */
const taskInputPageSchema = z.object({
  tasks: z.array(
    z.object({
      handle: z.string(),
      label: z.string().default(''),
      description: z.string().nullable().default(null),
      description_missing: z.boolean().default(false),
    }),
  ),
});

/** A task's name and its full assignment text (``null`` when it was not recorded). */
export interface TaskInput {
  handle: string;
  label: string;
  description: string | null;
  description_missing: boolean;
}

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

/** One recorded output chunk of a task, as the observation route pages it. */
const observedChunkSchema = z
  .object({
    chunk_id: z.union([z.string(), z.number()]).optional(),
    offset: z.number().optional(),
    next_offset: z.number().nullish(),
    output: z.unknown().optional(),
    fragment: z.boolean().optional(),
    serialization: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

/**
 * One task's row in an observation: its access view with the output read so far
 * (`progress`) or its conversation items (`transcript`, `summary`), or an error.
 */
const observedTaskSchema = z
  .object({
    handle: z.string(),
    error: z.unknown().optional(),
    output: z.array(observedChunkSchema).optional(),
    output_truncated: z.boolean().optional(),
    items: z.array(z.record(z.string(), z.unknown())).optional(),
    has_more: z.boolean().nullish(),
  })
  .passthrough();

const taskObservationSchema = z
  .object({
    tasks: z.array(observedTaskSchema),
    cursor: z.string().nullish(),
    has_more: z.boolean().optional(),
  })
  .passthrough();

export type ObservedTaskChunk = z.infer<typeof observedChunkSchema>;
export type ObservedTask = z.infer<typeof observedTaskSchema>;
export type TaskObservation = z.infer<typeof taskObservationSchema>;

export type SessionCoordinationGrant = z.infer<typeof coordinationGrant>;
export type SessionCoordinationRight = SessionCoordinationGrant['rights'][number];

/** Shared task controls use their original owner and report per-handle failures. */
export class TaskRepository extends MemoryRepository {
  /** The study a session belongs to (its branches and entries), or `in_study: false`. */
  public scienceLog(sessionId: string, signal?: AbortSignal): Promise<ScienceLog> {
    return readScienceLog(this.transport, sessionId, signal);
  }

  /** What one tool call ran, in what environment, and the files it read and wrote. */
  public transformRecord(callId: string, signal?: AbortSignal): Promise<TransformRecord> {
    return readTransformRecord(this.transport, callId, signal);
  }

  /** The questions asked in a session and its descendants, answered ones included. */
  public async flowQuestions(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<PendingInteraction[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: flowQuestionsPath(sessionId),
      decode: (value) => pendingInteractionListSchema.parse(value),
      signal,
    });
    return result.interactions as PendingInteraction[];
  }

  /** One paginated Core snapshot of the authenticated human's work across sessions. */
  public queryTasks(
    options: {
      cursor?: string;
      kind?: TaskSnapshot['kind'];
      activeOnly?: boolean;
      limit?: number;
      /** ``newest`` lists the most recently created work first. */
      order?: 'oldest' | 'newest';
    } = {},
    signal?: AbortSignal,
  ): Promise<TaskPage> {
    const query = new URLSearchParams({ limit: String(options.limit ?? 50) });
    if (options.cursor) query.set('cursor', options.cursor);
    if (options.kind) query.set('kind', options.kind);
    if (options.activeOnly) query.set('active_only', 'true');
    if (options.order) query.set('order', options.order);
    return this.transport.request({
      method: 'GET',
      path: `/v1/tasks/query?${query}`,
      decode: (value) => taskPageSchema.parse(value),
      signal,
    });
  }
  /** The newest tasks in this conversation's tree, of one kind when given. */
  public sessionTasks(
    sessionId: string,
    options: { kind?: TaskSnapshot['kind']; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<TaskPage> {
    const query = new URLSearchParams({
      scope: 'tree',
      order: 'newest',
      limit: String(options.limit ?? 50),
    });
    if (options.kind) query.set('kind', options.kind);
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/tasks/query?${query}`,
      decode: (value) => taskPageSchema.parse(value),
      signal,
    });
  }
  /** One task in this conversation's tree at its latest status, or `null` when it is not there. */
  public async sessionTask(
    sessionId: string,
    handle: string,
    signal?: AbortSignal,
  ): Promise<TaskPage['tasks'][number] | null> {
    const query = new URLSearchParams({ handle, scope: 'tree', limit: '1' });
    const page = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/tasks/query?${query}`,
      decode: (value) => taskPageSchema.parse(value),
      signal,
    });
    return page.tasks.find((task) => task.handle === handle) ?? null;
  }
  /**
   * What one task in this conversation's tree was given: its assignment text, read
   * (not observed) from the task index. ``null`` when the handle is not in the tree.
   */
  public async taskInput(
    sessionId: string,
    handle: string,
    signal?: AbortSignal,
  ): Promise<TaskInput | null> {
    const query = new URLSearchParams({ handle, scope: 'tree', limit: '1' });
    const page = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/tasks/query?${query}`,
      decode: (value) => taskInputPageSchema.parse(value),
      signal,
    });
    return page.tasks.find((task) => task.handle === handle) ?? null;
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

  /**
   * The flow run checkpointed under a task, or `null` when that task runs no
   * flow. A workflow run carries its live steps, proposals awaiting approval and
   * any typed stall.
   */
  public async taskFlow(
    sessionId: string,
    handle: string,
    signal?: AbortSignal,
  ): Promise<FlowRun | null> {
    try {
      return await this.transport.request({
        method: 'GET',
        path: `/v1/sessions/${encodeURIComponent(sessionId)}/tasks/${encodeURIComponent(handle)}/flow`,
        decode: (value) => flowRunSchema.parse(value),
        signal,
      });
    } catch (error) {
      if (error instanceof TransportError && error.status === 404) return null;
      throw error;
    }
  }

  /**
   * The assignment a person's message was delivered into (its `recipient_input`), or
   * `null` before it is confirmed. A session whose own work is a flow runs one flow run
   * per message under that assignment.
   */
  public async messageAssignment(
    sessionId: string,
    messageId: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const message = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
      decode: (value) => messageAssignmentSchema.parse(value),
      signal,
    });
    return message.metadata?.recipient_input?.assignment_id || null;
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

  /**
   * Moves the session's running foreground scripts, still running, to background
   * tasks: the agent's call returns with each task's handle and the agent goes on.
   * Returns how many were asked to move.
   */
  public async sendScriptsToBackground(sessionId: string, signal?: AbortSignal): Promise<number> {
    const result = await this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/scripts/foreground/background`,
      body: {},
      decode: (value) => z.object({ moved: z.number() }).parse(value),
      signal,
    });
    return result.moved;
  }

  /**
   * Reads what tasks recorded, without waiting or subscribing: `progress` pages
   * their output newest chunk first (pass the returned cursor for older ones);
   * `transcript` and `summary` read the conversation a delegated task held.
   * Reading acknowledges nothing the agent has yet to collect.
   */
  public observeTasks(
    sessionId: string,
    handles: string[],
    options: {
      cursor?: string;
      view?: 'progress' | 'transcript' | 'summary';
      history?: 'assignment' | 'session';
      limit?: number;
    } = {},
    signal?: AbortSignal,
  ): Promise<TaskObservation> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/tasks/observe`,
      body: {
        tasks: handles,
        view: options.view ?? 'progress',
        history: options.history ?? 'assignment',
        limit: options.limit ?? 50,
        ...(options.cursor ? { cursor: options.cursor } : {}),
      },
      decode: (value) => taskObservationSchema.parse(value),
      signal,
    });
  }
}
