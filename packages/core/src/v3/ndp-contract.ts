import { z } from 'zod';
import { sshRouteSchema, type SshRoute } from './infrastructure-contract.js';

export const ndpDatasetSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  description: z.string(),
  organization: z.string().optional(),
  endpoint_id: z.string(),
  endpoint_name: z.string(),
  access: z.enum(['viewer', 'request_access']).nullable(),
  resources: z.array(
    z.object({
      id: z.string(),
      path: z.string(),
      name: z.string(),
      format: z.string(),
      size: z.number().nonnegative(),
      revision: z.string(),
    }),
  ),
});
export const ndpSearchSchema = z.object({
  datasets: z.array(ndpDatasetSchema),
  warnings: z.array(z.string()),
  total: z.number().int().nonnegative().optional(),
  next_offset: z.number().int().nonnegative().nullable().optional(),
});
export type NDPDataset = z.infer<typeof ndpDatasetSchema>;
export const ndpOrganizationsSchema = z.object({
  organizations: z.array(
    z.object({ id: z.string(), endpoint_id: z.string(), endpoint_name: z.string() }),
  ),
});

export const ndpOperationSchema = z.object({
  id: z.string(),
  path: z.string(),
  method: z.string(),
  summary: z.string(),
  description: z.string(),
  read_only: z.boolean(),
  body_required: z.boolean(),
  body_schema: z.record(z.unknown()).nullable(),
  parameters: z.array(
    z
      .object({
        name: z.string().optional(),
        in: z.string().optional(),
        required: z.boolean().optional(),
        description: z.string().optional(),
        schema: z.record(z.unknown()).optional(),
      })
      .passthrough(),
  ),
});
export const ndpEndpointSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  ssh_profile: z.string(),
  ssh_route: sshRouteSchema.nullish(),
  authentication: z.enum(['none', 'ndp']),
  streaming_runtime: z.object({ python: z.string(), profile_path: z.string() }).nullish(),
  workspace_id: z.string(),
  observed_at: z.string(),
  hidden: z.boolean().optional(),
  api_title: z.string(),
  operations: z.array(ndpOperationSchema),
});
export const ndpCaptureSchema = z.object({
  id: z.string(),
  endpoint_id: z.string(),
  operation_id: z.string(),
  operation_summary: z.string().optional(),
  method: z.string(),
  started_at: z.string(),
  completed_at: z.string(),
  status_code: z.number(),
  content_type: z.string(),
  bytes_received: z.number(),
  stop_reason: z.string(),
  resource_id: z.string(),
  sha256: z.string(),
  events: z.number(),
  preview: z.string().optional(),
  preview_truncated: z.boolean().optional(),
  continuation: z
    .object({
      stream_id: z.string(),
      next_cursor: z.string(),
      count: z.number().int().nonnegative(),
      next_positions: z.record(z.string(), z.number().int()),
    })
    .nullish(),
  workspace_path: z.string().optional(),
  source_artifact_id: z.string().optional(),
  materialization: z.object({ state: z.string(), reason: z.string() }).optional(),
  endpoint_name: z.string().optional(),
  endpoint_url: z.string().optional(),
  ssh_profile: z.string().optional(),
  ssh_route: sshRouteSchema.nullish(),
});
export type NDPEndpointConnection = z.infer<typeof ndpEndpointSchema>;
export type NDPEndpointOperation = z.infer<typeof ndpOperationSchema>;
export type NDPEndpointCapture = z.infer<typeof ndpCaptureSchema>;
export type NDPEndpointInput = {
  name: string;
  url: string;
  ssh_profile: string;
  ssh_route?: SshRoute | null;
  authentication: 'none' | 'ndp';
  streaming_runtime?: { python: string; profile_path: string } | null;
};
export type NDPEndpointRequest = {
  operation_id: string;
  parameters: Record<string, unknown>;
  body?: unknown;
  max_seconds: number;
  max_events: number;
};
