import type { Degradation, Provenance } from './domain.js';

/** A2UI catalogs available to the connected agent. */
export interface A2uiAgentCapabilities {
  'v0.9': { supportedCatalogIds: string[]; acceptsInlineCatalogs?: boolean };
}

/** Negotiated service capabilities and their provenance. */
export interface CapabilityNegotiation {
  service?: { name: string; version: string };
  gact_versions: string[];
  a2ui_versions: string[];
  a2ui_capabilities?: A2uiAgentCapabilities;
  replay: { supported: boolean; retention?: number };
  capabilities: Record<string, unknown>;
  degradations: Degradation[];
  model_catalog: Provenance;
  active_model?: { provider_id: string; model_id: string; effort?: string };
  versions?: CapabilityVersions;
}

/** Build identity the connected service reports alongside `service.version`. Absent on older services. */
export interface CapabilityVersions {
  clio_agent?: string;
  backend_build?: string;
  python?: string;
  gact_contract?: string;
  marketplace: {
    source: string;
    ref?: string;
    pinned_commit?: string;
    installed_commit?: string;
    source_id: string;
  } | null;
}
