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
  /** Typed reason token (e.g. `codex_not_installed`); the `sandbox` row's, absent once ready. */
  reason?: string;
  /** `sandbox` row only: agent tools run inside an OS write fence now. */
  active?: boolean;
  /** `sandbox` row only: the fence resolved off, so the person must acknowledge running without it. */
  acknowledgement_required?: boolean;
  /** `sandbox` row only: the warning to show, present exactly when acknowledgement is required. */
  warning?: string;
}

export interface ServiceHealth {
  healthy: boolean;
  uptime_s: number;
  overall_status: string;
  integrations: ServiceIntegrationHealth[];
  tool_hooks_installed?: boolean;
  /** Where the agent's context lives; "history" = no clio-core, memory only. */
  context_mode?: 'clio_core' | 'history';
  /**
   * `starting` until the service can serve every request correctly, then `ready`.
   * `failed` once its start failed: it will not become ready until it is restarted.
   */
  readiness?: 'starting' | 'ready' | 'failed';
  /** What is still coming up while `readiness` is `starting` (task_runtime, marketplace, agent). */
  starting?: string[];
  /** Why the start failed, while `readiness` is `failed`. */
  failure?: ServiceStartFailure;
}

/** A failed start: a typed reason token and the plain message that says what to do. */
export interface ServiceStartFailure {
  reason: string;
  message: string;
}
