/**
 * The service health wire (`GET /v1/health`): split out of `domain.ts`, which is at its
 * line-count limit, as its own concern (matching `sandbox-domain.ts`).
 */
export interface ServiceIntegrationHealth {
  name: string;
  status: string;
  detail?: string;
  summary?: string;
  config_source?: string;
  next_action?: string;
  endpoint?: string;
  required?: boolean;
}

export interface ServiceHealth {
  healthy: boolean;
  uptime_s: number;
  overall_status: string;
  integrations: ServiceIntegrationHealth[];
  tool_hooks_installed?: boolean;
  /** Where the agent's context lives; "history" = no clio-core, memory only. */
  context_mode?: 'clio_core' | 'history';
}
