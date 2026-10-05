import { z } from 'zod';
import { connectedSourceGeneratedSchema } from '../generated/clio-schemas/connected-source.schema.js';

export const globusDestinationSchema = z.object({
  collection_id: z.string().uuid(),
  collection_root: z.string(),
  local_root: z.string(),
});
export type GlobusDestination = z.infer<typeof globusDestinationSchema>;
export const globusDestinationStatusSchema = z.object({
  destination: globusDestinationSchema.nullable(),
  origin: z.enum(['configured', 'detected', 'unavailable']),
  storage_root: z.string(),
});

export const sourceConfigurationSchema = z.object({
  ssh_profile: z.string().default(''),
  target_id: z.string().default(''),
  ssh_origin: z.enum(['desktop', 'clio']).default('desktop'),
  ssh_authentication: z.enum(['configured', 'key', 'password']).default('configured'),
  collection_id: z.string().default(''),
  destination_collection_id: z.string().default(''),
  destination_collection_root: z.string().default(''),
  destination_local_root: z.string().default(''),
  github_ref: z.string().default(''),
});
export const connectedSourceStateSchema = z
  .object({
    draft_id: z.string().optional(),
    connected: z.boolean(),
    origin: z.enum(['provider', 'desktop_upload']).default('provider'),
    authenticated: z.boolean(),
    account_url: z.string().url().optional(),
    account_authenticated: z.boolean().optional(),
    access_without_signin: z.boolean().optional(),
    configuration: sourceConfigurationSchema,
    can_edit_location: z.boolean().default(false),
    linked: z.boolean().optional(),
    link_revision: z.string().nullable().optional(),
    link_available: z.boolean().optional(),
    link_access: z.enum(['read_only', 'publish_later', 'write_through']).optional(),
    download_access: z.enum(['read_only', 'editable']).optional(),
    pending_edits: z.number().optional(),
    download_available: z.boolean().optional(),
  })
  .passthrough()
  .transform(
    ({
      draft_id,
      connected,
      origin,
      authenticated,
      account_authenticated,
      account_url,
      access_without_signin,
      configuration,
      can_edit_location,
      linked,
      link_revision,
      link_available,
      link_access,
      download_access,
      pending_edits,
      download_available,
      ...source
    }) => ({
      ...connectedSourceGeneratedSchema.parse(source),
      draft_id,
      connected,
      origin,
      authenticated,
      account_authenticated,
      account_url,
      access_without_signin,
      configuration,
      can_edit_location,
      linked,
      link_revision,
      link_available,
      link_access,
      download_access,
      pending_edits,
      download_available,
    }),
  );
export type ConnectedSourceState = z.infer<typeof connectedSourceStateSchema>;
export type SourceMode = 'read_only' | 'working_copy' | 'write_enabled';
export type SourceProviderId = ConnectedSourceState['provider'];
export interface SftpCredentials {
  password?: string;
  private_key?: string;
  passphrase?: string;
}
export interface CreateSourceInput {
  provider: SourceProviderId;
  label: string;
  root: string;
  mode: SourceMode;
  configuration?: Partial<z.infer<typeof sourceConfigurationSchema>>;
  sftp_credentials?: SftpCredentials;
}
export const sourceProviderSchema = z.object({
  id: z.enum(['local', 'sftp', 'google_drive', 'globus', 'github']),
  name: z.string(),
  logo: z.string(),
  authentication: z.enum(['none', 'ssh_profile', 'browser']),
  configured: z.boolean(),
  authenticated: z.boolean().optional(),
  account_url: z.string().url().optional(),
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
