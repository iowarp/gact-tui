import { z } from 'zod';
import { ResponseFeedbackRepository } from './response-feedback-repository.js';

/** Long-term memory categories, in the order the memory page lists them. */
export const MEMORY_CATEGORIES = [
  'profile',
  'preferences',
  'topics',
  'areas',
  'people',
  'environments',
] as const;

export const memoryFactSchema = z.object({
  id: z.string(),
  text: z.string(),
  source: z.enum(['user', 'inferred', 'imported', 'tool']),
  session: z.string(),
  message: z.string().default(''),
  at: z.string(),
  superseded_by: z.string().default(''),
  live: z.boolean(),
});

export const memoryUsageSchema = z.object({
  read: z.number().int(),
  loaded: z.number().int(),
  last_read: z.string(),
});

export const memoryDocumentSchema = z.object({
  name: z.string(),
  scope: z.string(),
  category: z.string(),
  slug: z.string(),
  description: z.string(),
  aliases: z.array(z.string()),
  updated: z.string(),
  sha: z.string(),
  text: z.string(),
  forgotten: z.array(z.string()),
  facts: z.array(memoryFactSchema),
  usage: memoryUsageSchema.optional(),
});

export const memoryVersionSchema = z.object({
  n: z.number().int(),
  text: z.string(),
  author: z.record(z.string(), z.string()),
  at: z.string(),
});

export const memoryFactChangeSchema = z.object({
  id: z.string(),
  kind: z.enum(['added', 'updated', 'removed', 'read']),
  before: z.string(),
  after: z.string(),
});
export type MemoryFactChange = z.infer<typeof memoryFactChangeSchema>;

export const memoryProposalSchema = z.object({
  id: z.string(),
  target: z.string(),
  change: z.enum(['add', 'supersede', 'merge', 'retire']),
  facts: z.array(z.string()),
  replaces: z.array(z.string()),
  merge_from: z.array(z.string()),
  description: z.string(),
  evidence: z.array(
    z.object({
      id: z.string(),
      session: z.string(),
      messages: z.array(z.string()),
      source: z.string(),
      fact: z.string().default(''),
    }),
  ),
  sources: z.array(z.string()),
  rationale: z.string(),
  origin: z.string(),
  handle: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  decided_by: z.string(),
  created_at: z.string(),
  decided_at: z.string(),
  base_text: z.string(),
  proposed_text: z.string(),
  needs_review: z.boolean(),
  changes: z.array(memoryFactChangeSchema).nullish(),
  applied_changes: z.array(memoryFactChangeSchema).nullish(),
  applied_before_text: z.string().optional(),
  applied_text: z.string().nullish(),
  target_label: z.string().optional(),
});

export const memorySummarySchema = z.object({
  enabled: z.boolean(),
  inbox: z.number().int(),
  documents: z.number().int(),
});

export const memoryImportReportSchema = z.object({
  import_id: z.string(),
  added: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
});

export const memoryAssistantImportSchema = z.object({
  import_id: z.string(),
  candidates: z.number().int(),
  session: z.string().optional(),
  handle: z.string().optional(),
});

export type MemoryFact = z.infer<typeof memoryFactSchema>;
export type MemoryDocument = z.infer<typeof memoryDocumentSchema>;
export type MemoryVersion = z.infer<typeof memoryVersionSchema>;
export type MemoryProposal = z.infer<typeof memoryProposalSchema>;
export type MemorySummary = z.infer<typeof memorySummarySchema>;

const memoryRunModelSchema = z.object({
  provider_id: z.string(),
  model_id: z.string(),
  source: z.string().optional(),
});
export const memoryCreationRunSchema = z.object({
  id: z.string(),
  origin: z.string(),
  source_session: z.string(),
  workspace_id: z.string().default(''),
  curator_session: z.string(),
  handle: z.string(),
  state: z.string(),
  reason: z.string(),
  started_at: z.string(),
  completed_at: z.string(),
  models: z.object({
    extract: memoryRunModelSchema.nullable(),
    curator: memoryRunModelSchema.nullable(),
  }),
  usage: z.object({
    input_tokens: z.number().nullable(),
    output_tokens: z.number().nullable(),
    cost_usd: z.number().nullable(),
    cost_known: z.boolean(),
  }),
  extract: z
    .object({
      returned: z.number().int(),
      kept: z.number().int(),
      dropped: z.record(z.string(), z.number()),
    })
    .nullable(),
  proposal_counts: z.object({
    accepted: z.number().int(),
    pending: z.number().int(),
    rejected: z.number().int(),
  }),
  targets: z.array(z.string()).default([]),
});
export const memoryCreationLogSchema = z.object({
  runs: z.array(memoryCreationRunSchema),
  next_cursor: z.string().nullable(),
  background: z
    .object({
      last_tick: z.string().optional(),
      in_flight: z.number().optional(),
      started: z.number().optional(),
      skipped: z.record(z.string(), z.number()).optional(),
      off: z.boolean().optional(),
    })
    .nullish(),
});
export type MemoryCreationRun = z.infer<typeof memoryCreationRunSchema>;

const documentPath = (name: string) =>
  `/v1/memory/documents/${name.split('/').map(encodeURIComponent).join('/')}`;

/** Long-term memory: what the agent keeps about the user, their projects and their work. */
export class MemoryRepository extends ResponseFeedbackRepository {
  /** Create explicitly supplied facts without invoking a model or replacing existing memory. */
  public createMemoryDocument(
    input: {
      scope: string;
      category: (typeof MEMORY_CATEGORIES)[number];
      slug: string;
      description: string;
      facts: string[];
    },
    signal?: AbortSignal,
  ): Promise<MemoryDocument> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/memory/documents',
      body: input,
      signal,
      decode: (value) => memoryDocumentSchema.parse(value),
    });
  }

  /** Recorded background extraction/curation attempts, including runs with no candidates. */
  public memoryCreationRuns(cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: '50' });
    if (cursor) query.set('cursor', cursor);
    return this.transport.request({
      method: 'GET',
      path: `/v1/memory/creation-runs?${query}`,
      signal,
      decode: (value) => memoryCreationLogSchema.parse(value),
    });
  }

  public memorySummary(signal?: AbortSignal): Promise<MemorySummary> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/memory/summary',
      signal,
      decode: (value) => memorySummarySchema.parse(value),
    });
  }

  public memoryDocuments(scope = 'all', signal?: AbortSignal): Promise<MemoryDocument[]> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/memory/documents?${new URLSearchParams({ scope })}`,
      signal,
      decode: (value) =>
        z.object({ documents: z.array(memoryDocumentSchema) }).parse(value).documents,
    });
  }

  public memoryDocument(name: string, signal?: AbortSignal): Promise<MemoryDocument> {
    return this.transport.request({
      method: 'GET',
      path: documentPath(name),
      signal,
      decode: (value) => memoryDocumentSchema.parse(value),
    });
  }

  public memoryVersions(name: string, signal?: AbortSignal): Promise<MemoryVersion[]> {
    return this.transport.request({
      method: 'GET',
      path: `${documentPath(name)}/versions`,
      signal,
      decode: (value) => z.object({ versions: z.array(memoryVersionSchema) }).parse(value).versions,
    });
  }

  public restoreMemoryVersion(name: string, version: number, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `${documentPath(name)}/restore`,
      body: { version },
      signal,
      decode: (value) => memoryDocumentSchema.parse(value),
    });
  }

  public editMemoryFact(
    name: string,
    factId: string,
    input: { fact: string; expected_sha: string },
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'POST',
      path: `${documentPath(name)}/facts/${encodeURIComponent(factId)}`,
      body: input,
      signal,
      decode: (value) => memoryDocumentSchema.parse(value),
    });
  }

  /** Forget a fact and the earlier values it replaced; its last fact removes the document. */
  public forgetMemoryFact(name: string, factId: string, expectedSha: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'DELETE',
      path: `${documentPath(name)}/facts/${encodeURIComponent(factId)}?${new URLSearchParams({ expected_sha: expectedSha })}`,
      signal,
      decode: (value) =>
        z
          .union([
            z.object({
              name: z.string(),
              removed: z.literal(true),
              forgotten: z.array(z.string()),
            }),
            memoryDocumentSchema.extend({ forgotten: z.array(z.string()) }),
          ])
          .parse(value),
    });
  }

  public forgetMemoryDocument(name: string, expectedSha: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'DELETE',
      path: `${documentPath(name)}?${new URLSearchParams({ expected_sha: expectedSha })}`,
      signal,
      decode: (value) => z.object({ name: z.string(), removed: z.boolean() }).parse(value),
    });
  }

  public memoryProposals(status = 'pending', signal?: AbortSignal): Promise<MemoryProposal[]> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/memory/proposals?${new URLSearchParams({ status })}`,
      signal,
      decode: (value) =>
        z.object({ proposals: z.array(memoryProposalSchema) }).parse(value).proposals,
    });
  }

  public acceptMemoryProposal(id: string, facts?: string[], signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/memory/proposals/${encodeURIComponent(id)}/accept`,
      body: facts ? { facts } : {},
      signal,
      decode: (value) => memoryProposalSchema.parse(value),
    });
  }

  public rejectMemoryProposal(id: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/memory/proposals/${encodeURIComponent(id)}/reject`,
      signal,
      decode: (value) => memoryProposalSchema.parse(value),
    });
  }

  /** An export of a scope (`all`, `user`, `project/<id>`), or of one document by `name`. */
  public exportMemory(
    target: { scope?: string; name?: string } = {},
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const query: Record<string, string> = target.name
      ? { name: target.name }
      : { scope: target.scope ?? 'all' };
    return this.transport.request({
      method: 'GET',
      path: `/v1/memory/export?${new URLSearchParams(query)}`,
      responseType: 'bytes',
      signal,
      decode: (value) => value as Uint8Array,
    });
  }

  public importMemoryArchive(archive: Uint8Array, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: '/v1/memory/import',
      rawBody: archive,
      signal,
      decode: (value) => memoryImportReportSchema.parse(value),
    });
  }

  public assistantImportPrompt(signal?: AbortSignal): Promise<string> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/memory/import/assistant-prompt',
      signal,
      decode: (value) => z.object({ prompt: z.string() }).parse(value).prompt,
    });
  }

  public importFromAssistant(text: string, scope = 'user', signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: '/v1/memory/import/assistant',
      body: { text, scope },
      signal,
      timeoutMs: 180_000,
      decode: (value) => memoryAssistantImportSchema.parse(value),
    });
  }

  public workspaceMemory(workspaceId: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/memory`,
      signal,
      decode: (value) => z.object({ use_account_memory: z.boolean() }).parse(value),
    });
  }

  public setWorkspaceMemory(workspaceId: string, useAccountMemory: boolean, signal?: AbortSignal) {
    return this.transport.request({
      method: 'PUT',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/memory`,
      body: { use_account_memory: useAccountMemory },
      signal,
      decode: (value) => z.object({ use_account_memory: z.boolean() }).parse(value),
    });
  }

  public turnMemoryOff(sessionId: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'PUT',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/memory`,
      body: { off: true },
      signal,
      decode: (value) => z.object({ memory_off: z.boolean() }).parse(value),
    });
  }
}
