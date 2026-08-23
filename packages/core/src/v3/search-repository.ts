import { z } from 'zod';
import { PromptRepository } from './prompt-repository.js';

export interface MessageSearchHit {
  message_id: string;
  part_id?: string;
  snippet: string;
  score?: number;
}

export interface MemorySearchHit {
  session_id: string;
  session_title: string;
  workspace_id: string;
  message_id: string;
  part_id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  created_at: string;
  updated_at?: string;
  text: string;
  score: number;
  match_terms: string[];
  metadata: Record<string, unknown>;
}

export interface MemorySearchResult {
  query: string;
  include_cross_session: boolean;
  searched_sessions: string[];
  hits: MemorySearchHit[];
  metadata: Record<string, unknown>;
}

export interface ContextSearchResult {
  session_id: string;
  query: string;
  semantic: boolean;
  hits: Array<{ scope: string; score: number }>;
}

const messageSearchSchema = z.object({
  matches: z.array(
    z.object({
      message_id: z.string(),
      part_id: z.string().optional(),
      snippet: z.string(),
      score: z.number().optional(),
    }),
  ),
});

const memorySearchSchema = z.object({
  query: z.string(),
  include_cross_session: z.boolean().default(false),
  searched_sessions: z.array(z.string()).default([]),
  hits: z.array(
    z.object({
      session_id: z.string(),
      session_title: z.string().default(''),
      workspace_id: z.string().default(''),
      message_id: z.string(),
      part_id: z.string().optional(),
      role: z.enum(['user', 'assistant', 'system', 'tool']),
      created_at: z.string(),
      updated_at: z.string().optional(),
      text: z.string(),
      score: z.number().default(0),
      match_terms: z.array(z.string()).default([]),
      metadata: z.record(z.unknown()).default({}),
    }),
  ),
  metadata: z.record(z.unknown()).default({}),
});

const contextSearchSchema = z.object({
  session_id: z.string(),
  query: z.string(),
  semantic: z.boolean().default(false),
  hits: z.array(z.object({ scope: z.string(), score: z.number() })).default([]),
});

/** Authoritative message, memory, and context discovery routes. */
export class SearchRepository extends PromptRepository {
  public async searchSessionMessages(
    sessionId: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<MessageSearchHit[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/messages/search?q=${encodeURIComponent(query)}`,
      decode: (value) => messageSearchSchema.parse(value),
      signal,
    });
    return result.matches;
  }

  public searchMemory(
    query: string,
    options: {
      sessionId?: string;
      workspaceId?: string;
      includeCrossSession?: boolean;
      limit?: number;
    } = {},
    signal?: AbortSignal,
  ): Promise<MemorySearchResult> {
    const params = new URLSearchParams({ query });
    if (options.sessionId) params.set('session_id', options.sessionId);
    if (options.workspaceId) params.set('workspace_id', options.workspaceId);
    if (options.includeCrossSession) params.set('include_cross_session', 'true');
    if (options.limit) params.set('limit', String(options.limit));
    return this.transport.request({
      method: 'GET',
      path: `/v1/memory/search?${params.toString()}`,
      decode: (value) => memorySearchSchema.parse(value) as MemorySearchResult,
      signal,
    });
  }

  public searchContext(
    sessionId: string,
    query: string,
    options: { scopePrefix?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<ContextSearchResult> {
    const params = new URLSearchParams({ q: query });
    if (options.scopePrefix) params.set('scope_prefix', options.scopePrefix);
    if (options.limit) params.set('k', String(options.limit));
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/context/search?${params.toString()}`,
      decode: (value) => contextSearchSchema.parse(value),
      signal,
    });
  }
}
