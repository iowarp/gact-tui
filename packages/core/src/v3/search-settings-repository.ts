import { z } from 'zod';
import { WorkspaceFileRepository } from './workspace-file-repository.js';

/**
 * The search sources CLIO sends web and literature searches to, as the person set them
 * up: which are on, the order web sources are tried in, which they approved, keys, and
 * how each one has been answering on this computer. Keys are written here but never read
 * back.
 */
export const searchLimitKindSchema = z.enum([
  'rate_limited',
  'allowance_used',
  'failed',
  'key_rejected',
]);

export type SearchLimitKind = z.infer<typeof searchLimitKindSchema>;

export const searchAllowanceSchema = z.object({
  spent: z.number(),
  limit: z.number(),
  unit: z.enum(['requests', 'usd']),
  per: z.enum(['hour', 'day']),
  /** What the provider itself says is left (OpenAlex dollars). */
  provider_remaining: z.number().optional(),
});

export type SearchAllowance = z.infer<typeof searchAllowanceSchema>;

const searchSourceBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  free_use: z.string().default(''),
  key_page: z.string().default(''),
  key_benefit: z.string().default(''),
  reads_pages: z.boolean().default(false),
  key_required: z.boolean().default(false),
  has_key: z.boolean().default(false),
  declined: z.boolean().default(false),
  limited_until: z.number().nullable().default(null),
  // An unrecognized limit is still a limit: keep it readable instead of refusing the view.
  limited_kind: z.union([searchLimitKindSchema, z.string()]).nullable().default(null),
  last_answered: z.number().nullable().default(null),
  last_failure: z.number().nullable().default(null),
  last_failure_kind: z.string().nullable().default(null),
  answered_today: z.number().int().nonnegative().default(0),
  failed_today: z.number().int().nonnegative().default(0),
  /** How CLIO reaches the source: keyless, registered (contact email), key, or paid. */
  tier: z.string().default('keyless'),
  /** The person marked the saved key as a paid plan. */
  paid: z.boolean().default(false),
  /** This CLIO's use of the free allowance; null when the tier has none. */
  allowance: searchAllowanceSchema.nullable().default(null),
  /** Requests waiting in, and running from, CLIO's queue for the source. */
  waiting: z.number().int().nonnegative().default(0),
  running: z.number().int().nonnegative().default(0),
  enabled: z.boolean().default(true),
});

export const webSearchSourceSchema = searchSourceBaseSchema.extend({
  position: z.number().int().default(0),
  approved: z.boolean().default(false),
});

export const literatureSearchSourceSchema = searchSourceBaseSchema;

export type WebSearchSource = z.infer<typeof webSearchSourceSchema>;
export type LiteratureSearchSource = z.infer<typeof literatureSearchSourceSchema>;
export type SearchSource = WebSearchSource | LiteratureSearchSource;

export const searchSettingsSchema = z.object({
  enabled: z.boolean(),
  auto_switch: z.boolean().default(true),
  service_url: z.string().default(''),
  contact_email: z.string().default(''),
  literature_approved: z.boolean().default(false),
  web: z.array(webSearchSourceSchema).default([]),
  literature: z.array(literatureSearchSourceSchema).default([]),
});

export type SearchSettings = z.infer<typeof searchSettingsSchema>;

export interface SearchSettingsUpdate {
  enabled?: boolean;
  web_order?: string[];
  web_disabled?: string[];
  auto_switch?: boolean;
  literature_disabled?: string[];
  approved?: string[];
  service_url?: string;
  contact_email?: string;
  /** Sources whose saved key is on a paid plan. */
  paid?: string[];
}

/** Where a newly keyed source goes: to the front of the web order, or where it was. */
export type SearchKeyPlacement = 'first' | 'keep';

const savedKeySchema = z.object({
  source: z.string(),
  saved: z.boolean(),
  settings: searchSettingsSchema,
});

export type SearchKeySaved = z.infer<typeof savedKeySchema>;

const removedKeySchema = z.object({ source: z.string(), removed: z.boolean() });

const openAlexKeySchema = z.object({
  saved: z.boolean(),
  status: z.string().nullable().default(null),
  message: z.string().nullable().default(null),
});

export type OpenAlexKeyRequest = z.infer<typeof openAlexKeySchema>;

function sourceKeyPath(sourceId: string): string {
  return `/v1/search/providers/${encodeURIComponent(sourceId)}/key`;
}

export class SearchSettingsRepository extends WorkspaceFileRepository {
  public searchSettings(signal?: AbortSignal): Promise<SearchSettings> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/search/providers',
      decode: (value) => searchSettingsSchema.parse(value),
      signal,
    });
  }

  public updateSearchSettings(
    update: SearchSettingsUpdate,
    signal?: AbortSignal,
  ): Promise<SearchSettings> {
    return this.transport.request({
      method: 'PATCH',
      path: '/v1/search/providers',
      body: update,
      decode: (value) => searchSettingsSchema.parse(value),
      signal,
    });
  }

  /**
   * Save the person's key for a source. The server never returns it. A web source moves
   * to the front of the order unless ``placement`` is ``keep``.
   */
  public saveSearchSourceKey(
    sourceId: string,
    apiKey: string,
    placement?: SearchKeyPlacement,
    signal?: AbortSignal,
  ): Promise<SearchKeySaved> {
    return this.transport.request({
      method: 'PUT',
      path: sourceKeyPath(sourceId),
      body: placement === undefined ? { api_key: apiKey } : { api_key: apiKey, placement },
      decode: (value) => savedKeySchema.parse(value),
      signal,
    });
  }

  public removeSearchSourceKey(
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<{ source: string; removed: boolean }> {
    return this.transport.request({
      method: 'DELETE',
      path: sourceKeyPath(sourceId),
      decode: (value) => removedKeySchema.parse(value),
      signal,
    });
  }

  /** Ask OpenAlex to email a free key; it works once the person opens the activation link. */
  public requestOpenAlexKey(email: string, signal?: AbortSignal): Promise<OpenAlexKeyRequest> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/search/openalex-key',
      body: { email },
      decode: (value) => openAlexKeySchema.parse(value),
      signal,
    });
  }
}
