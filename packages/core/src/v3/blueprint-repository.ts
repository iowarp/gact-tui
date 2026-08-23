import { z } from 'zod';
import type { AgentBlueprint, AgentBlueprintSource, WorkspaceFileEntry } from './domain.js';
import { SessionObservabilityRepository } from './session-observability-repository.js';
import { agentBlueprintSourceSchema } from './schemas.js';
import {
  agentBlueprintListSchema,
  agentBlueprintSourceListSchema,
  workspaceFileListSchema,
} from './repository-decoders.js';

/** Marketplace-backed blueprint lifecycle and session activation. */
export class BlueprintRepository extends SessionObservabilityRepository {
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
    input: { name: string; source: string; ref?: string; pinned_commit?: string },
    signal?: AbortSignal,
  ): Promise<AgentBlueprintSource> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/agent-blueprints/sources',
      body: input,
      decode: (value) =>
        agentBlueprintSourceSchema.parse(
          z.object({ source: z.unknown() }).parse(value).source,
        ) as AgentBlueprintSource,
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
      decode: (value) =>
        agentBlueprintSourceSchema.parse(
          z.object({ source: z.unknown() }).parse(value).source,
        ) as AgentBlueprintSource,
      signal,
    });
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
}
