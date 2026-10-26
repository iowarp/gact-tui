import { z } from 'zod';
import { agentTaskRecordSchema, type AgentTaskRecord } from './agent-task-domain.js';
import type { AsyncProcess, ContextFile, ContextFrame, SessionDiff } from './domain.js';
import { ExecutionProvenanceRepository } from './execution-provenance-repository.js';
import { modelChoiceSchema, operationalRunStateSchema } from './schemas.js';
import { variantRunsFromRecords, type VariantRuns } from './variant-reducer.js';
import { variantRunListSchema } from './variant-schemas.js';
import { cursorPageMetadataSchema } from './repository-decoders.js';
import {
  cursorPageQuery,
  readCursorPages,
  type CursorPage,
  type CursorPageOptions,
} from './transport.js';

const sessionDiffSchema = z.object({
  id: z.string(),
  path: z.string(),
  status: z.enum(['applied', 'reverted']),
  created: z.boolean().default(false),
  unified_diff: z.string().optional(),
  lines_added: z.number().int().nonnegative().optional(),
  lines_removed: z.number().int().nonnegative().optional(),
  undo_available: z.boolean(),
  undo_unavailable_reason: z.string().optional(),
  message_id: z.string().optional(),
  part_id: z.string().optional(),
  call_id: z.string().optional(),
  tool_name: z.string().optional(),
  recorded_at: z.string().optional(),
  reverted_at: z.string().optional(),
});

const contextFileSchema = z.object({
  path: z.string(),
  display_path: z.string().optional(),
  workspace_id: z.string().optional(),
  source: z.string().optional(),
  mode: z.enum(['edit', 'read', 'pin']).default('read'),
  size: z.number().int().nonnegative().optional(),
  last_modified: z.string().optional(),
  language: z.string().optional(),
  added_at: z.string().optional(),
});

const contextFrameItemSchema = z.object({
  kind: z.string(),
  source_id: z.string().optional(),
  role: z.string().optional(),
  path: z.string().optional(),
  display_path: z.string().optional(),
  included: z.boolean().default(true),
  reason: z.string().optional(),
  tokens_estimated: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const contextFrameSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  turn_id: z.string().optional(),
  user_message_id: z.string().optional(),
  assistant_message_id: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  status: z
    .enum(['assembled', 'context_error', 'completed', 'error', 'cancelled'])
    .default('assembled'),
  model: z.record(z.string(), z.string()).default({}),
  agent: z.record(z.string(), z.unknown()).default({}),
  prompt: z.record(z.string(), z.unknown()).default({}),
  items: z.array(contextFrameItemSchema).default([]),
  tokens_estimated: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const asyncProcessSchema = z
  .object({
    kind: z.enum(['agent', 'mcp-task', 'mcp', 'question']),
    id: z.string(),
    title: z.string(),
    live_state: z.string(),
    status: z.string(),
    root_session_id: z.string().optional(),
    owner_session_id: z.string().optional(),
    parent_session_id: z.string().optional(),
    child_session_id: z.string().optional(),
    parent_turn_id: z.string().optional(),
    task_path: z.array(z.string()).default([]),
    handle_id: z.string().optional(),
    host: z.string().optional(),
    placement: z.string().optional(),
    depth: z.number().int().nonnegative().optional(),
    run_index: z.number().int().nonnegative().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    error_reason: z.string().optional(),
    /** Set when the task's child conversation runs a flow: its flow id. */
    flow: z
      .object({
        id: z.string(),
        status: z.string().optional(),
        outcome: z
          .object({ reason: z.string().optional(), message: z.string().optional() })
          .nullish(),
        previous_handle: z.string().optional(),
        detail: z.string().optional(),
      })
      .nullish()
      .transform((value) => value ?? undefined),
    /** The model the child conversation runs on and why. */
    model_choice: modelChoiceSchema.nullish().transform((value) => value ?? undefined),
    result: z
      .object({
        answer: z.string().optional(),
        answer_excerpt: z.string().optional(),
        message_ref: z.string().optional(),
        workflow_state: z.record(z.string(), z.unknown()).optional(),
      })
      .nullish()
      .transform((value) => value ?? undefined),
  })
  .passthrough()
  .transform((process) => ({
    ...process,
    live_state: operationalRunStateSchema.parse(process.live_state),
    metadata: process as Record<string, unknown>,
  }));

const effectiveToolSchema = z.object({
  name: z.string(),
  title: z.string(),
  source: z.string(),
  representation: z.string(),
});

const toolsetTraceSchema = z.object({
  events: z
    .array(
      z.object({
        occurred_at: z.string().optional(),
        payload: z.object({
          agent_id: z.string(),
          session_id: z.string(),
          tools: z.array(effectiveToolSchema),
        }),
      }),
    )
    .default([]),
});

export type EffectiveAgentTool = z.infer<typeof effectiveToolSchema>;

export interface EffectiveAgentToolset {
  agentId: string;
  sessionId: string;
  recordedAt?: string;
  tools: EffectiveAgentTool[];
}

/** Authoritative read models for session work, evidence, and retained context. */
export class SessionObservabilityRepository extends ExecutionProvenanceRepository {
  /** Read the newest effective toolset recorded by the agent build itself. */
  public async effectiveAgentToolset(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<EffectiveAgentToolset | undefined> {
    const value = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/trace?scope=agent.toolset.recorded&limit=50`,
      decode: (input) => toolsetTraceSchema.parse(input),
      signal,
    });
    const event = value.events.at(-1);
    if (!event) return undefined;
    return {
      agentId: event.payload.agent_id,
      sessionId: event.payload.session_id,
      recordedAt: event.occurred_at,
      tools: event.payload.tools,
    };
  }

  /**
   * The session's BestOfN / Refine runs as clio-core records them (LM- and
   * user-judged; each try with its own steps): what the variant tabs are
   * rebuilt from after a reload. A failure (404 `not_found`, 503
   * `no_context_store`, 500 `variant_record_unreadable`) rejects typed.
   */
  public async variantRuns(sessionId: string, signal?: AbortSignal): Promise<VariantRuns> {
    const value = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/variant-runs`,
      decode: (input) => variantRunListSchema.parse(input),
      signal,
    });
    return variantRunsFromRecords(value.runs);
  }

  public async sessionDiffs(sessionId: string, signal?: AbortSignal): Promise<SessionDiff[]> {
    const value = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/diffs`,
      decode: (input) => z.object({ diffs: z.array(sessionDiffSchema).default([]) }).parse(input),
      signal,
    });
    return value.diffs as SessionDiff[];
  }

  /**
   * Undo one change the agent made: the service restores the previous content
   * (or deletes a file the agent created) only while the file is still what the
   * agent wrote. A refusal rejects typed (404 `file_change_not_found`; 409
   * `already_reverted`, `undo_unavailable`, `file_changed_since_write`; 403
   * `path_outside_workspace`, `file_policy`, `policy_denied`).
   */
  public async revertSessionDiff(
    sessionId: string,
    changeId: string,
    signal?: AbortSignal,
  ): Promise<SessionDiff> {
    const value = await this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/diffs/revert`,
      body: { id: changeId },
      decode: (input) => z.object({ reverted: sessionDiffSchema }).parse(input),
      signal,
    });
    return value.reverted as SessionDiff;
  }

  public async contextFiles(sessionId: string, signal?: AbortSignal): Promise<ContextFile[]> {
    const value = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/context/files`,
      decode: (input) => z.object({ files: z.array(contextFileSchema).default([]) }).parse(input),
      signal,
    });
    return value.files.map((file) => ({
      ...file,
      display_path: file.display_path || file.path,
    })) as ContextFile[];
  }

  public async contextFrames(sessionId: string, signal?: AbortSignal): Promise<ContextFrame[]> {
    const value = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/context/frames`,
      decode: (input) => z.object({ frames: z.array(contextFrameSchema).default([]) }).parse(input),
      signal,
    });
    return value.frames as ContextFrame[];
  }

  public async asyncProcesses(sessionId: string, signal?: AbortSignal): Promise<AsyncProcess[]> {
    return readCursorPages((cursor) => this.asyncProcessesPage(sessionId, { cursor }, signal));
  }

  public async asyncProcessesPage(
    sessionId: string,
    options: CursorPageOptions & { includeDescendants?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<CursorPage<AsyncProcess>> {
    const query = cursorPageQuery(options);
    query.set('include_descendants', String(options.includeDescendants ?? true));
    const value = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/async-processes${query.size ? `?${query}` : ''}`,
      decode: (input) =>
        cursorPageMetadataSchema
          .extend({ processes: z.array(asyncProcessSchema).default([]) })
          .parse(input),
      signal,
    });
    return {
      items: value.processes as AsyncProcess[],
      cursor: value.cursor,
      total: value.total,
      revision: value.revision,
    };
  }

  /** Explicit full child-history read; live views use the common task page instead. */
  public async sessionAgentTasks(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<AgentTaskRecord[]> {
    return readCursorPages((cursor) => this.sessionAgentTasksPage(sessionId, { cursor }, signal));
  }

  public async sessionAgentTasksPage(
    sessionId: string,
    options: CursorPageOptions = {},
    signal?: AbortSignal,
  ): Promise<CursorPage<AgentTaskRecord>> {
    const query = cursorPageQuery(options);
    const value = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/agent-tasks${query.size ? `?${query}` : ''}`,
      decode: (input) =>
        cursorPageMetadataSchema
          .extend({ tasks: z.array(agentTaskRecordSchema).default([]) })
          .parse(input),
      signal,
    });
    return {
      items: value.tasks,
      cursor: value.cursor,
      total: value.total,
      revision: value.revision,
    };
  }
}
