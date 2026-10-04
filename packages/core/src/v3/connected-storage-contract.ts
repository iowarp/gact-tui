import { z } from 'zod';
import { connectedSourceGeneratedSchema } from '../generated/clio-schemas/connected-source.schema.js';

export const sourceConfigurationSchema = z.object({
  ssh_profile: z.string().default(''),
  collection_id: z.string().default(''),
  destination_collection_id: z.string().default(''),
  destination_collection_root: z.string().default(''),
  destination_local_root: z.string().default(''),
});
export const connectedSourceStateSchema = z
  .object({
    connected: z.boolean(),
    origin: z.enum(['provider', 'desktop_upload']).default('provider'),
    authenticated: z.boolean(),
    configuration: sourceConfigurationSchema,
  })
  .passthrough()
  .transform(({ connected, origin, authenticated, configuration, ...source }) => ({
    ...connectedSourceGeneratedSchema.parse(source),
    connected,
    origin,
    authenticated,
    configuration,
  }));
export type ConnectedSourceState = z.infer<typeof connectedSourceStateSchema>;
export type SourceMode = 'read_only' | 'working_copy' | 'write_enabled';
export type SourceProviderId = ConnectedSourceState['provider'];
export interface CreateSourceInput {
  provider: SourceProviderId;
  label: string;
  root: string;
  mode: SourceMode;
  configuration?: Partial<z.infer<typeof sourceConfigurationSchema>>;
}
export const sourceProviderSchema = z.object({
  id: z.enum(['local', 'sftp', 'google_drive', 'globus']),
  name: z.string(),
  logo: z.string(),
  authentication: z.enum(['none', 'ssh_profile', 'browser']),
  configured: z.boolean(),
  capabilities: z
    .object({
      supported_modes: z.array(z.enum(['read_only', 'working_copy', 'write_enabled'])),
      unavailable_reasons: z.record(z.string()),
    })
    .passthrough(),
  setup_requirement: z.string().nullable(),
});
export type SourceProvider = z.infer<typeof sourceProviderSchema>;
export const sourceEntrySchema = z.object({
  path: z.string(),
  kind: z.enum(['file', 'directory']),
  size: z.number(),
  revision: z.string(),
});
export type SourceEntry = z.infer<typeof sourceEntrySchema>;
export const sourceOperationSchema = z.object({
  id: z.string(),
  source_id: z.string(),
  kind: z.string(),
  state: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted']),
  bytes_done: z.number(),
  bytes_total: z.number(),
  native_job_id: z.string().nullable(),
  cancel_requested: z.boolean(),
  error: z.string().nullable(),
  applied_paths: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});
export type SourceOperation = z.infer<typeof sourceOperationSchema>;
export const sourceReviewSchema = z.object({
  id: z.string(),
  source_id: z.string(),
  manifest_id: z.string(),
  created_at: z.string(),
  changes: z.array(
    z.object({
      path: z.string(),
      kind: z.enum(['add', 'modify', 'delete']),
      conflict: z.boolean(),
      preview: z.string().default(''),
      preview_note: z.string().default(''),
      local_hash: z.string().nullable(),
      baseline_revision: z.string().nullable(),
      upstream_revision: z.string().nullable(),
    }),
  ),
});
export type SourceReview = z.infer<typeof sourceReviewSchema>;
