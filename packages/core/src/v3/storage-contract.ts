import { z } from 'zod';
import { hostStorageLocationsGeneratedSchema } from '../generated/clio-schemas/host-storage-locations.schema.js';

export { hostStorageLocationsGeneratedSchema as hostStorageLocationsSchema };
export type {
  HostStorageLocations,
  ConnectedSource,
  ContentSelection,
} from '../generated/clio-schemas/_models.js';

export const hostStorageSettingsSchema = z.object({
  target_id: z.string(),
  host_label: z.string(),
  hostname: z.string().optional(),
  requested: hostStorageLocationsGeneratedSchema,
  effective: hostStorageLocationsGeneratedSchema,
  defaults: hostStorageLocationsGeneratedSchema,
});

export const hostPathInspectionSchema = z.object({
  target_id: z.string(),
  host_label: z.string(),
  path: z.string(),
  existing_ancestor: z.string(),
  exists: z.boolean(),
  writable: z.boolean(),
  free_bytes: z.number().nonnegative(),
  total_bytes: z.number().nonnegative(),
  required_bytes: z.number().nonnegative(),
  capacity_ok: z.boolean(),
  parent: z.string(),
  entries: z.array(z.object({ name: z.string(), path: z.string() })),
  truncated: z.boolean(),
});

export type HostStorageSettings = z.infer<typeof hostStorageSettingsSchema>;
export type HostPathInspection = z.infer<typeof hostPathInspectionSchema>;
