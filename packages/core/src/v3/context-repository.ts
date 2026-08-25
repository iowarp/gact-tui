import { z } from 'zod';
import type { ContextSnapshot } from './domain.js';
import { contextStateSchema } from './schemas.js';
import { SearchRepository } from './search-repository.js';

export interface SessionContextPolicy {
  session_id: string;
  memory_scope: 'session';
  writable_scope: 'session';
  cross_session_read_available: boolean;
  cross_session_read_endpoint?: string;
  requires_user_consent: boolean;
  notes: string[];
  metadata: Record<string, unknown>;
}

export interface ContextPreferences {
  session_id: string;
  automatic_compaction: boolean;
  autocompact_pct: number;
}

const contextPolicySchema = z.object({
  session_id: z.string(),
  memory_scope: z.literal('session').default('session'),
  writable_scope: z.literal('session').default('session'),
  cross_session_read_available: z.boolean().default(false),
  cross_session_read_endpoint: z.string().nullish(),
  requires_user_consent: z.boolean().default(true),
  notes: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

const contextPreferencesSchema = z.object({
  session_id: z.string(),
  automatic_compaction: z.boolean(),
  autocompact_pct: z.number().positive().max(1),
});

function contextSnapshot(value: unknown): ContextSnapshot {
  const result = contextStateSchema.parse(value);
  return {
    session_id: result.session_id,
    scope: result.scope,
    used_tokens: result.used_tokens ?? undefined,
    limit_tokens: result.window_tokens || undefined,
    live_tokens: result.live_tokens,
    live_block_count: result.live_block_count,
    tokens_by_kind: result.tokens_by_kind,
    categories: result.categories,
    autocompact_enabled: result.autocompact_enabled,
    autocompact_pct: result.autocompact_pct ?? undefined,
    segments: result.segments,
    render_text: result.render_text,
    render_keys: result.render_keys,
    provenance: {
      source: 'server',
      observed_at: new Date().toISOString(),
      stale: false,
    },
  };
}

/** Session-compartment policy and live working-set operations. */
export class ContextRepository extends SearchRepository {
  public async contextState(
    sessionId: string,
    scope: string,
    signal?: AbortSignal,
  ): Promise<ContextSnapshot> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/context/state?scope=${encodeURIComponent(scope)}`,
      decode: contextSnapshot,
      signal,
    });
  }

  public contextPolicy(sessionId: string, signal?: AbortSignal): Promise<SessionContextPolicy> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/context/policy`,
      decode: (value) => contextPolicySchema.parse(value) as SessionContextPolicy,
      signal,
    });
  }

  public compactContext(
    sessionId: string,
    scope: string,
    signal?: AbortSignal,
  ): Promise<ContextSnapshot> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/context/compact?scope=${encodeURIComponent(scope)}`,
      decode: contextSnapshot,
      signal,
    });
  }

  public updateContextPreferences(
    sessionId: string,
    input: { automatic_compaction?: boolean; autocompact_pct?: number },
    signal?: AbortSignal,
  ): Promise<ContextPreferences> {
    return this.transport.request({
      method: 'PATCH',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/context/preferences`,
      body: input,
      decode: (value) => contextPreferencesSchema.parse(value) as ContextPreferences,
      signal,
    });
  }
}
