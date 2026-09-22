import { z } from 'zod';
import { forwardCompatibleEnum } from './schema-utils.js';

export const degradationSchema = z.object({
  code: z.string(),
  reason: z.string(),
  capability: z.string().optional(),
  recoverable: z.boolean().default(false),
});

export const provenanceSchema = z.object({
  source: forwardCompatibleEnum(['server', 'provider', 'connection', 'unavailable']),
  observed_at: z.string(),
  stale: z.boolean(),
  reason: z.string().optional(),
});

/** The marketplace registry pinned in the connected service's build, when it has one. */
export const capabilityMarketplaceVersionSchema = z.object({
  source: z.string(),
  ref: z.string().optional(),
  pinned_commit: z.string().optional(),
  installed_commit: z.string().optional(),
  source_id: z.string(),
});

/** Build identity the connected service reports alongside `service.version` (additive: absent on older services). */
export const capabilityVersionsSchema = z.object({
  clio_agent: z.string().optional(),
  backend_build: z.string().optional(),
  python: z.string().optional(),
  gact_contract: z.string().optional(),
  marketplace: capabilityMarketplaceVersionSchema.nullable().default(null),
});

/** The installed A2UI catalogs advertised by the connected agent. */
export const a2uiCapabilitiesSchema = z.object({
  'v0.9': z.object({
    supportedCatalogIds: z.array(z.string()),
    acceptsInlineCatalogs: z.boolean().optional(),
  }),
});

export const capabilitiesSchema = z.object({
  service: z
    .object({
      name: z.string(),
      version: z.string(),
    })
    .optional(),
  gact_versions: z.array(z.string()),
  a2ui_versions: z.array(z.string()).default([]),
  a2ui_capabilities: a2uiCapabilitiesSchema.optional(),
  replay: z.object({
    supported: z.boolean(),
    retention: z.number().int().nonnegative().optional(),
  }),
  capabilities: z.record(z.string(), z.unknown()),
  degradations: z.array(degradationSchema).default([]),
  model_catalog: provenanceSchema,
  active_model: z
    .object({
      provider_id: z.string(),
      model_id: z.string(),
      effort: z.string().optional(),
    })
    .optional(),
  versions: capabilityVersionsSchema.optional(),
});
