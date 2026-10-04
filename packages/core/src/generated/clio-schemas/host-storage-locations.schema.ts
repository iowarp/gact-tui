/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: host_storage_locations.json
 */
import { z } from 'zod';
import type { HostStorageLocations } from './_models.js';

export const hostStorageLocationsGeneratedSchema: z.ZodType<HostStorageLocations> = z
  .object({
    captures: z.string().default(''),
    models: z.string().default(''),
    root: z.string().default(''),
    service_data: z.string().default(''),
    temporary: z.string().default(''),
  })
  .strict();
