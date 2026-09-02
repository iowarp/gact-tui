import { z } from 'zod';
import type { AsyncProcess, ContextFile, ContextFrame, SessionDiff } from './domain.js';
import { ExecutionProvenanceRepository } from './execution-provenance-repository.js';
import { operationalRunStateSchema } from './schemas.js';

const sessionDiffSchema = z.object({
  path: z.string(),
  status: z.string().default('pending'),
  applied: z.boolean().default(false),
  unified_diff: z.string().optional(),
  message_id: z.string().optional(),
  part_id: z.string().optional(),
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
    kind: z.enum(['agent', 'mcp-task']),
    id: z.string(),
    title: z.string(),
    live_state: operationalRunStateSchema,
    status: z.string(),
    parent_session_id: z.string().optional(),
    child_session_id: z.string().optional(),
    parent_turn_id: z.string().optional(),
    handle_id: z.string().optional(),
    host: z.string().optional(),
    placement: z.string().optional(),
    depth: z.number().int().nonnegative().optional(),
    run_index: z.number().int().nonnegative().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    error_reason: z.string().optional(),
    result: z
      .object({
        answer_excerpt: z.string().optional(),
        message_ref: z.string().optional(),
        workflow_state: z.record(z.string(), z.unknown()).optional(),
      })
      .nullish()
      .transform((value) => value ?? undefined),
  })
  .passthrough()
  .transform((process) => ({ ...process, metadata: process as Record<string, unknown> }));

/** Authoritative read models for session work, evidence, and retained context. */
export class SessionObservabilityRepository extends ExecutionProvenanceRepository {
  public async sessionDiffs(sessionId: string, signal?: AbortSignal): Promise<SessionDiff[]> {
    const value = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/diffs`,
      decode: (input) => z.object({ diffs: z.array(sessionDiffSchema).default([]) }).parse(input),
      signal,
    });
    return value.diffs as SessionDiff[];
  }

  public applySessionDiffs(
    sessionId: string,
    paths: readonly string[],
    signal?: AbortSignal,
  ): Promise<{ applied: string[]; write_errors?: Record<string, string> }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/diffs/apply`,
      body: { paths: [...paths] },
      decode: (input) =>
        z
          .object({
            applied: z.array(z.string()).default([]),
            write_errors: z.record(z.string(), z.string()).optional(),
          })
          .parse(input),
      signal,
    });
  }

  public rejectSessionDiffs(
    sessionId: string,
    paths: readonly string[],
    signal?: AbortSignal,
  ): Promise<{ rejected: string[] }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/diffs/reject`,
      body: { paths: [...paths] },
      decode: (input) => z.object({ rejected: z.array(z.string()).default([]) }).parse(input),
      signal,
    });
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
    const value = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/async-processes`,
      decode: (input) =>
        z.object({ processes: z.array(asyncProcessSchema).default([]) }).parse(input),
      signal,
    });
    return value.processes as AsyncProcess[];
  }
}
