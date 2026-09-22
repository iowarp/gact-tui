/**
 * Types for the desktop's dedicated protected-execution (sandbox) setup
 * surface — split out of `domain.ts` (#775, no-accretion: a new concern
 * belongs in its own owner module, not appended to the file already at its
 * line-count ratchet), matching `infrastructure-domain.ts` / `memory-domain.ts`'s pattern.
 */
import type { ServiceIntegrationHealth } from './domain.js';

/**
 * `GET /v1/system/sandbox` — the `sandbox` doctor row alone, projected the
 * same way `/v1/health`'s `integrations[]` is (same {@link
 * ServiceIntegrationHealth} fields), plus three fields that row alone needs:
 * the setup lock (so the desktop button can show a busy/spinner state
 * without racing a concurrent run), the row's typed reason token lifted out
 * of `detail`/`summary` prose, and where Codex was found.
 */
export interface SandboxStatus extends ServiceIntegrationHealth {
  /** Typed reason token (e.g. `codex_enforcement_unverified`, `sandbox_fence_pending_restart`) — absent once READY. */
  reason?: string;
  /** Whether a `setupSandbox()` run is currently in flight on the connected service. */
  setup_in_progress: boolean;
  /** Where the connected service found its Codex binary, or `undefined` when it found none. */
  codex_source?: 'bundled' | 'path';
}

/**
 * `POST /v1/system/sandbox/setup` — the outcome of one protected-execution
 * setup attempt. The connected service returns this same shape whether the
 * run started (2xx), was refused because one was already in flight (409,
 * typed `sandbox_setup_in_progress`), or the host platform has nothing to
 * provision (501, typed `sandbox_setup_unsupported`) — never a bare error,
 * so the caller can always read `reason` and the fresh `row`.
 */
export interface SandboxSetupResult {
  status: string;
  reason?: string;
  elevated?: boolean;
  /** The `sandbox` row re-probed after this attempt — never the pre-attempt row. */
  row?: SandboxStatus;
}
