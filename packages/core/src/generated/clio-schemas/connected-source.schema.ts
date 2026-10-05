/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: connected_source.json
 */
import { z } from 'zod';
import type { ConnectedSource } from './_models.js';

export const connectedSourceGeneratedSchema: z.ZodType<ConnectedSource> = z
  .object({
    capabilities: z
      .object({
        browse: z.boolean().default(true),
        conditional_write: z.boolean().default(false),
        download: z.boolean().default(true),
        link_folder: z.boolean().default(false),
        native_transfer: z.boolean().default(false),
        read_only_mount: z.boolean().default(false),
        revision_check: z.boolean().default(false),
        search: z.boolean().default(false),
        supported_modes: z.array(z.enum(['read_only', 'working_copy', 'write_enabled'])).optional(),
        unavailable_reasons: z.record(z.string()).optional(),
        writable_folder: z.boolean().default(false),
      })
      .strict(),
    id: z.string().min(1),
    label: z.string().min(1),
    local_path: z.union([z.string(), z.null()]).default(null),
    materialization: z
      .enum(['not_materialized', 'transferring', 'ready', 'stale', 'failed'])
      .default('not_materialized'),
    mode: z.enum(['read_only', 'working_copy', 'write_enabled']).default('read_only'),
    operation_id: z.union([z.string(), z.null()]).default(null),
    owner: z.object({ clio_id: z.string().min(1), host_id: z.string().min(1) }).strict(),
    provider: z.enum(['local', 'sftp', 'google_drive', 'globus', 'github']),
    revision: z.union([z.string(), z.null()]).default(null),
    root: z.string().min(1),
    schema_version: z.literal(1).default(1),
    workspace_id: z.union([z.string(), z.null()]).default(null),
  })
  .strict();
