import { z } from 'zod';
import type {
  ExpertPackDefinition,
  HookInspection,
  PermissionPolicy,
  RuntimeMetrics,
  ServiceHealth,
} from './domain.js';
import type { MemoryEvent, MemoryStatistics } from './memory-domain.js';
import type { AgentDefinition } from './agent-domain.js';
import { agentDefinitionSchema } from './schemas.js';
import { SessionHistoryRepository } from './session-history-repository.js';

const recordSchema = z.record(z.string(), z.unknown());
const expertPackSchema = z.object({
  id: z.string(),
  version: z.string().default(''),
  title: z.string(),
  display_name: z.string().optional(),
  description: z.string().default(''),
  scope: z.string().default('unknown'),
  enabled: z.boolean().default(false),
  validation_errors: z.array(z.string()).default([]),
  kind: z.literal('pack').default('pack'),
  root: z.string().optional(),
  root_path: z.string().optional(),
  manifest_path: z.string().optional(),
  definition_path: z.string().optional(),
  defaults: recordSchema.default({}),
  metadata: recordSchema.default({}),
});
const expertPackDetailSchema = z.object({
  expert_pack: expertPackSchema,
  agents: z.array(agentDefinitionSchema).default([]),
});
const expertPackValidationSchema = z.object({
  pack: expertPackSchema,
  agents: z.array(agentDefinitionSchema).default([]),
  enabled: z.boolean(),
  validation_errors: z.array(z.string()).default([]),
});
const policySchema = z
  .object({
    scope: z.string(),
    scope_id: z.string().optional(),
    action: z.string(),
    priority: z.number().int().optional(),
    kind: z.enum(['tool', 'domain', 'fs_root', 'plan_acl', 'hook']).optional(),
    tool_name_pattern: z.string().optional(),
    path_pattern: z.string().optional(),
    host_pattern: z.string().optional(),
    modes: z.array(z.string()).optional(),
    on: z.array(z.string()).optional(),
  })
  .passthrough()
  .transform((policy) => ({ ...policy, metadata: policy as Record<string, unknown> }));
const hookInspectionSchema = z.object({
  backend: z.string().default('unknown'),
  enabled: z.boolean().default(false),
  hooks: z.array(recordSchema).default([]),
  recent_invocations: z.array(recordSchema).default([]),
});
const memoryStatisticsSchema = z.object({
  cache: z.object({
    hits: z.number().int().nonnegative(),
    misses: z.number().int().nonnegative(),
    hit_rate: z.number().nonnegative(),
    capacity: z.number().int().nonnegative(),
  }),
  session: z
    .object({
      session_id: z.string(),
      messages_retained: z.number().int().nonnegative().default(0),
      tokens_retained: z.number().int().nonnegative().default(0),
      tokens_budget: z.number().int().nonnegative().nullish(),
      profiles_attached: z.number().int().nonnegative().default(0),
      context_files_attached: z.number().int().nonnegative().default(0),
      context_files_by_mode: z.record(z.string(), z.number().int().nonnegative()).default({}),
      compact_summaries: z.number().int().nonnegative().default(0),
      token_pressure: z.number().nonnegative().default(0),
      threshold_state: z.enum(['empty', 'normal', 'warning', 'critical']).default('empty'),
      compaction_recommended: z.boolean().default(false),
    })
    .nullish()
    .transform((value) =>
      value
        ? {
            ...value,
            tokens_budget: value.tokens_budget ?? undefined,
          }
        : undefined,
    ),
  global: z.object({
    conversations_total: z.number().int().nonnegative(),
    invocations_total: z.number().int().nonnegative(),
  }),
  metadata: recordSchema.default({}),
});
const memoryEventSchema = z.object({
  id: z.string(),
  version: z.number().int().positive().default(1),
  type: z.literal('compact_summary'),
  session_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  summary_message_id: z.string(),
  archived_count: z.number().int().nonnegative().default(0),
  summary_chars: z.number().int().nonnegative().default(0),
  transcript_chars: z.number().int().nonnegative().default(0),
  focus: z.string().default(''),
  arc_status: z.string().default('unknown'),
  metadata: recordSchema.default({}),
});
const serviceHealthSchema = z.object({
  healthy: z.boolean(),
  uptime_s: z.number().int().nonnegative(),
  overall_status: z.string(),
  integrations: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      detail: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      summary: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      config_source: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      next_action: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      endpoint: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
    }),
  ),
  tool_hooks_installed: z
    .boolean()
    .nullish()
    .transform((value) => value ?? undefined),
});
const runtimeMetricsSchema = z.object({
  uptime_s: z.number().int().nonnegative(),
  sessions: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    by_status: z.record(z.string(), z.number().int().nonnegative()).default({}),
  }),
  messages: z.object({
    total: z.number().int().nonnegative(),
    by_role: z.record(z.string(), z.number().int().nonnegative()).default({}),
  }),
  tokens: z.object({
    input_total: z.number().int().nonnegative(),
    output_total: z.number().int().nonnegative(),
    cache_read_total: z.number().int().nonnegative().default(0),
    cache_write_total: z.number().int().nonnegative().default(0),
  }),
  cost: z.object({
    total_usd: z.number().nonnegative(),
    by_provider: z.record(z.string(), z.number().nonnegative()).default({}),
  }),
  latencies: z
    .record(
      z.string(),
      z.object({
        count: z.number().int().nonnegative(),
        p50_ms: z.number().nonnegative(),
        p95_ms: z.number().nonnegative(),
        max_ms: z.number().nonnegative(),
      }),
    )
    .default({}),
});

/** Administrative catalogs and diagnostics owned by the connected service. */
export class AdministrationRepository extends SessionHistoryRepository {
  public agent(agentId: string, signal?: AbortSignal): Promise<AgentDefinition> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/agents/${encodeURIComponent(agentId)}`,
      decode: (input) => agentDefinitionSchema.parse(input),
      signal,
    });
  }

  public createAgent(input: AgentDefinition, signal?: AbortSignal): Promise<AgentDefinition> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/agents',
      body: input,
      decode: (value) => agentDefinitionSchema.parse(value),
      signal,
    });
  }

  public updateAgent(
    agentId: string,
    input: AgentDefinition,
    signal?: AbortSignal,
  ): Promise<AgentDefinition> {
    return this.transport.request({
      method: 'PUT',
      path: `/v1/agents/${encodeURIComponent(agentId)}`,
      body: input,
      decode: (value) => agentDefinitionSchema.parse(value),
      signal,
    });
  }

  public deleteAgent(agentId: string, signal?: AbortSignal): Promise<void> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/agents/${encodeURIComponent(agentId)}`,
      decode: () => undefined,
      signal,
    });
  }

  public async expertPacks(
    workspaceId?: string,
    signal?: AbortSignal,
  ): Promise<ExpertPackDefinition[]> {
    const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
    const value = await this.transport.request({
      method: 'GET',
      path: `/v1/expert-packs${query}`,
      decode: (input) => z.object({ expert_packs: z.array(expertPackSchema) }).parse(input),
      signal,
    });
    return value.expert_packs as ExpertPackDefinition[];
  }

  public expertPack(
    packId: string,
    workspaceId?: string,
    signal?: AbortSignal,
  ): Promise<{ expert_pack: ExpertPackDefinition; agents: AgentDefinition[] }> {
    const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
    return this.transport.request({
      method: 'GET',
      path: `/v1/expert-packs/${encodeURIComponent(packId)}${query}`,
      decode: (value) =>
        expertPackDetailSchema.parse(value) as {
          expert_pack: ExpertPackDefinition;
          agents: AgentDefinition[];
        },
      signal,
    });
  }

  public validateExpertPack(
    input: { path: string; scope: 'global' | 'workspace' | 'session' },
    signal?: AbortSignal,
  ): Promise<{
    pack: ExpertPackDefinition;
    agents: AgentDefinition[];
    enabled: boolean;
    validation_errors: string[];
  }> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/expert-packs/validate',
      body: input,
      decode: (value) => expertPackValidationSchema.parse(value),
      signal,
    }) as Promise<{
      pack: ExpertPackDefinition;
      agents: AgentDefinition[];
      enabled: boolean;
      validation_errors: string[];
    }>;
  }

  public installExpertPack(
    input: {
      source_id?: string;
      source?: string;
      pack_id?: string;
      ref?: string;
      pinned_commit?: string;
      scope: 'global' | 'workspace';
      workspace_id?: string;
    },
    signal?: AbortSignal,
  ): Promise<unknown> {
    const { pack_id, ...rest } = input;
    return this.transport.request({
      method: 'POST',
      path: '/v1/expert-packs/install',
      body: { ...rest, blueprint_id: pack_id },
      decode: (value) => value,
      signal,
    });
  }

  public updateExpertPack(
    packId: string,
    input: { scope: 'global' | 'workspace'; workspace_id?: string },
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/expert-packs/${encodeURIComponent(packId)}/update`,
      body: input,
      decode: (value) => value,
      signal,
    });
  }

  public deleteExpertPack(
    packId: string,
    input: { scope: 'global' | 'workspace'; workspace_id?: string },
    signal?: AbortSignal,
  ): Promise<void> {
    const query = new URLSearchParams({ scope: input.scope });
    if (input.workspace_id) query.set('workspace_id', input.workspace_id);
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/expert-packs/${encodeURIComponent(packId)}?${query.toString()}`,
      decode: () => undefined,
      signal,
    });
  }

  public policies(signal?: AbortSignal): Promise<PermissionPolicy[]> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/policies',
      decode: (input) =>
        z.object({ policies: z.array(policySchema) }).parse(input).policies as PermissionPolicy[],
      signal,
    });
  }

  public updatePolicies(policies: readonly PermissionPolicy[], signal?: AbortSignal) {
    return this.transport.request({
      method: 'PUT',
      path: '/v1/policies',
      body: { policies: policies.map(({ metadata: _metadata, ...policy }) => policy) },
      decode: (input) =>
        z.object({ policies: z.array(policySchema) }).parse(input).policies as PermissionPolicy[],
      signal,
    });
  }

  public hooks(signal?: AbortSignal): Promise<HookInspection> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/hooks',
      decode: (input) => hookInspectionSchema.parse(input),
      signal,
    });
  }

  public memoryStatistics(signal?: AbortSignal, sessionId?: string): Promise<MemoryStatistics> {
    const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return this.transport.request({
      method: 'GET',
      path: `/v1/memory/stats${query}`,
      decode: (input) => memoryStatisticsSchema.parse(input),
      signal,
    });
  }

  public async memoryEvents(
    sessionId: string,
    limit = 50,
    signal?: AbortSignal,
  ): Promise<MemoryEvent[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/memory/events?limit=${Math.max(1, Math.min(200, Math.trunc(limit)))}`,
      decode: (input) => z.object({ events: z.array(memoryEventSchema) }).parse(input),
      signal,
    });
    return result.events as MemoryEvent[];
  }

  public async memoryEvent(
    sessionId: string,
    eventId: string,
    signal?: AbortSignal,
  ): Promise<MemoryEvent> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/memory/events/${encodeURIComponent(eventId)}`,
      decode: (input) => z.object({ event: memoryEventSchema }).parse(input),
      signal,
    });
    return result.event as MemoryEvent;
  }

  public serviceHealth(signal?: AbortSignal): Promise<ServiceHealth> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/health',
      decode: (input) => serviceHealthSchema.parse(input),
      signal,
    });
  }

  public runtimeMetrics(signal?: AbortSignal): Promise<RuntimeMetrics> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/metrics',
      decode: (input) => runtimeMetricsSchema.parse(input),
      signal,
    });
  }
}
