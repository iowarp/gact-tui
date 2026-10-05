import { z } from 'zod';
import { blueprintOperationSchema, type BlueprintOperation } from './blueprint-operation.js';
import type { AgentBlueprint, AgentBlueprintSource, WorkspaceFileEntry } from './domain.js';
import type {
  AgentBlueprintSourceUpdate,
  AgentBlueprintSourceUpdates,
} from './blueprint-domain.js';
import { SessionObservabilityRepository } from './session-observability-repository.js';
import { agentBlueprintSourceSchema } from './schemas.js';
import {
  agentBlueprintListSchema,
  agentBlueprintSourceListSchema,
  agentBlueprintSourceUpdateListSchema,
  agentBlueprintSourceUpdateSingleSchema,
  workspaceFileListSchema,
} from './repository-decoders.js';

/** Marketplace-backed blueprint lifecycle and session activation. */
export class BlueprintRepository extends SessionObservabilityRepository {
  public async blueprintOperations(signal?: AbortSignal): Promise<BlueprintOperation[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/agent-blueprints/operations',
      signal,
      decode: (value) => z.object({ operations: z.array(blueprintOperationSchema) }).parse(value),
    });
    return result.operations;
  }

  public async agentBlueprints(
    workspaceId?: string,
    signal?: AbortSignal,
  ): Promise<AgentBlueprint[]> {
    const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/agent-blueprints${query}`,
      decode: (value) => agentBlueprintListSchema.parse(value),
      signal,
    });
    return result.agent_blueprints as AgentBlueprint[];
  }

  public setSessionAgentBlueprint(
    sessionId: string,
    blueprintId: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/agent-blueprint`,
      body: { blueprint_id: blueprintId },
      decode: (value) => z.record(z.string(), z.unknown()).parse(value),
      signal,
    });
  }

  public async agentBlueprintSources(signal?: AbortSignal): Promise<AgentBlueprintSource[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/agent-blueprints/sources',
      decode: (value) => agentBlueprintSourceListSchema.parse(value),
      signal,
    });
    return result.sources as AgentBlueprintSource[];
  }

  public addAgentBlueprintSource(
    input: {
      name: string;
      source: string;
      ref?: string;
      pinned_commit?: string;
      working_checkout?: string;
      scope?: 'global' | 'workspace';
      workspace_id?: string;
    },
    signal?: AbortSignal,
  ): Promise<AgentBlueprintSource> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/agent-blueprints/sources',
      body: input,
      decode: (value) => decodeSourceMutation(value),
      signal,
    });
  }

  public refreshAgentBlueprintSource(
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<AgentBlueprintSource> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/agent-blueprints/sources/${encodeURIComponent(sourceId)}/refresh`,
      decode: (value) => decodeSourceMutation(value),
      signal,
    });
  }

  /** Save marketplace selectors without replacing the installed runtime. */
  public configureAgentBlueprintSource(
    sourceId: string,
    input: {
      name: string;
      source: string;
      ref?: string;
      pinned_commit?: string;
      working_checkout?: string;
      expected_updated_at: string;
    },
    signal?: AbortSignal,
  ): Promise<AgentBlueprintSource> {
    return this.transport.request({
      method: 'PATCH',
      path: `/v1/agent-blueprints/sources/${encodeURIComponent(sourceId)}`,
      body: input,
      decode: (value) => agentBlueprintSourceSchema.parse((value as { source: unknown }).source),
      signal,
    });
  }

  /**
   * Checks every marketplace source's installed commit against its remote ref
   * without applying anything. Each row's `reason` is the typed outcome the
   * caller renders honestly — `update_available` is `null` whenever the check
   * itself could not determine an answer (e.g. `git_unavailable`, `timeout`),
   * never inferred as false.
   */
  public async blueprintSourceUpdates(signal?: AbortSignal): Promise<AgentBlueprintSourceUpdates> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/agent-blueprints/sources/updates',
      decode: (value) => agentBlueprintSourceUpdateListSchema.parse(value),
      signal,
    });
    return result as AgentBlueprintSourceUpdates;
  }

  /**
   * The same check as {@link blueprintSourceUpdates}, scoped to one source.
   * The route wraps its single row under `source` (mirroring the list
   * route's `{ sources, checked_at }` envelope) rather than returning the row
   * bare — verified against the live route, not assumed from its name.
   */
  public async blueprintSourceUpdate(
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<AgentBlueprintSourceUpdate> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/agent-blueprints/sources/${encodeURIComponent(sourceId)}/updates`,
      decode: (value) => agentBlueprintSourceUpdateSingleSchema.parse(value),
      signal,
    });
    return result.source as AgentBlueprintSourceUpdate;
  }

  public deleteAgentBlueprintSource(sourceId: string, signal?: AbortSignal): Promise<void> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/agent-blueprints/sources/${encodeURIComponent(sourceId)}`,
      decode: () => undefined,
      signal,
    });
  }

  public installAgentBlueprint(
    input: {
      source_id: string;
      blueprint_id: string;
      scope: 'global' | 'workspace';
      workspace_id?: string;
    },
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/agent-blueprints/install',
      body: input,
      decode: (value) => value,
      signal,
    });
  }

  public updateAgentBlueprint(
    blueprintId: string,
    input: { scope: 'global' | 'workspace'; workspace_id?: string },
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}/update`,
      body: input,
      decode: (value) => value,
      signal,
    });
  }

  public deleteAgentBlueprint(
    blueprintId: string,
    input: { scope: 'global' | 'workspace'; workspace_id?: string },
    signal?: AbortSignal,
  ): Promise<void> {
    const query = new URLSearchParams({ scope: input.scope });
    if (input.workspace_id) query.set('workspace_id', input.workspace_id);
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}?${query.toString()}`,
      decode: () => undefined,
      signal,
    });
  }

  public async agentBlueprintFiles(
    blueprintId: string,
    options: { workspaceId?: string; sessionId?: string } = {},
    signal?: AbortSignal,
  ): Promise<WorkspaceFileEntry[]> {
    const query = new URLSearchParams();
    if (options.workspaceId) query.set('workspace_id', options.workspaceId);
    if (options.sessionId) query.set('session_id', options.sessionId);
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}/files${query.size ? `?${query.toString()}` : ''}`,
      decode: (value) => workspaceFileListSchema.parse(value),
      signal,
    });
    return result.entries as WorkspaceFileEntry[];
  }

  public readAgentBlueprintFile(
    blueprintId: string,
    path: string,
    options: { workspaceId?: string; sessionId?: string } = {},
    signal?: AbortSignal,
  ): Promise<string> {
    const query = new URLSearchParams({ path });
    if (options.workspaceId) query.set('workspace_id', options.workspaceId);
    if (options.sessionId) query.set('session_id', options.sessionId);
    return this.transport.request({
      method: 'GET',
      path: `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}/files/read?${query.toString()}`,
      responseType: 'text',
      decode: (value) => z.string().parse(value),
      signal,
    });
  }

  public writeAgentBlueprintFile(
    blueprintId: string,
    path: string,
    content: string,
    options: { workspaceId?: string; sessionId?: string; expectedHash?: string } = {},
    signal?: AbortSignal,
  ): Promise<{
    entry: WorkspaceFileEntry;
    validation_errors: string[];
    validation_warnings: string[];
    content_hash?: string;
  }> {
    const query = new URLSearchParams({ path });
    if (options.workspaceId) query.set('workspace_id', options.workspaceId);
    if (options.sessionId) query.set('session_id', options.sessionId);
    return this.transport.request({
      method: 'PUT',
      path: `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}/files/write?${query.toString()}`,
      body: { content, ...(options.expectedHash ? { expected_hash: options.expectedHash } : {}) },
      decode: (value) => {
        const parsed = z
          .object({
            entry: z.object({
              path: z.string(),
              type: z.enum(['file', 'dir']),
              size: z.number().int().nonnegative().optional(),
              modified: z.string().optional(),
            }),
            validation: z.object({
              validation_errors: z.array(z.string()).default([]),
              validation_warnings: z.array(z.string()).default([]),
            }),
            content_hash: z.string().optional(),
          })
          .parse(value);
        return {
          entry: parsed.entry as WorkspaceFileEntry,
          validation_errors: parsed.validation.validation_errors,
          validation_warnings: parsed.validation.validation_warnings,
          ...(parsed.content_hash ? { content_hash: parsed.content_hash } : {}),
        };
      },
      signal,
    });
  }

  public readAgentBlueprintDraft(
    blueprintId: string,
    path: string,
    options: { workspaceId?: string; sessionId?: string } = {},
    signal?: AbortSignal,
  ): Promise<{ content: string; content_hash: string }> {
    const query = new URLSearchParams({ path });
    if (options.workspaceId) query.set('workspace_id', options.workspaceId);
    if (options.sessionId) query.set('session_id', options.sessionId);
    return this.transport.request({
      method: 'GET',
      path: `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}/draft?${query}`,
      decode: (value) => z.object({ content: z.string(), content_hash: z.string() }).parse(value),
      signal,
    });
  }

  public agentBlueprintAuthoring(
    blueprintId: string,
    options: { workspaceId?: string; sessionId?: string } = {},
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams();
    if (options.workspaceId) query.set('workspace_id', options.workspaceId);
    if (options.sessionId) query.set('session_id', options.sessionId);
    return this.transport.request({
      method: 'GET',
      path: `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}/authoring?${query}`,
      decode: (value) =>
        z
          .object({
            source: z.string(),
            git_source: z.boolean().default(false),
            reload_source: z.string().optional(),
            separate_checkout: z.boolean().default(false),
            scope: z.string(),
            installed_revision: z.string(),
            has_draft: z.boolean(),
            unpublished_files: z.array(z.string()),
            checkout_required: z.boolean(),
            reload_required: z.boolean(),
          })
          .parse(value),
      signal,
    });
  }

  public publishAgentBlueprintDraft(
    blueprintId: string,
    options: {
      workspaceId?: string;
      sessionId?: string;
      checkout?: string;
      commitMessage?: string;
      push?: boolean;
    } = {},
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams();
    if (options.workspaceId) query.set('workspace_id', options.workspaceId);
    if (options.sessionId) query.set('session_id', options.sessionId);
    return this.transport.request({
      method: 'POST',
      path: `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}/publish?${query}`,
      body: {
        checkout: options.checkout || '',
        commit_message: options.commitMessage || '',
        push: options.push || false,
      },
      decode: (value) =>
        z
          .object({
            published: z.array(z.string()),
            source: z.string(),
            reload_required: z.boolean(),
            git: z
              .object({ commit: z.string(), branch: z.string(), pushed: z.boolean() })
              .optional(),
          })
          .parse(value),
      signal,
    });
  }
}

/** HTTP success must not turn a failed marketplace install into a success toast. */
function decodeSourceMutation(value: unknown): AgentBlueprintSource {
  const row = agentBlueprintSourceSchema.parse(
    z.object({ source: z.unknown() }).parse(value).source,
  );
  if (row.status === 'error' || row.status === 'unknown') {
    throw new Error(
      row.error || 'Marketplace setup did not complete. Inspect its status and retry.',
    );
  }
  return row as AgentBlueprintSource;
}
