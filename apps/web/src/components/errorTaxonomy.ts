/**
 * Error-taxonomy model: classifies backend/turn errors into tones and
 * user-facing categories for consistent error rendering.
 */
import type { IconName } from './IconTypes.js';

/**
 * v0.2 structured error taxonomy (SPEC §14.2). clio populates
 * `Message.error_info.error` with one of these machine-readable codes; the web
 * surfaces a human label, a category tone, and an icon per code so the inline
 * error pill reads like a categorized state rather than a raw string.
 *
 * Unknown codes (including vendor `x_<vendor>_*` types) fall back to the
 * `internal_error` presentation per §14.2 while preserving the raw code.
 */
export type ErrorTone = 'error' | 'warning' | 'info';

export interface ErrorPresentation {
  /** Human-readable category label (e.g. "Rate limited"). */
  label: string;
  /** Tone drives the pill colour: hard failure vs transient vs informational. */
  tone: ErrorTone;
  /** Icon glyph for the category. */
  icon: IconName;
  /** One-line plain-English hint about what the category means. */
  hint: string;
}

const INTERNAL_ERROR: ErrorPresentation = {
  label: 'Internal error',
  tone: 'error',
  icon: 'alert',
  hint: 'An unclassified backend failure.',
};

const TAXONOMY: Record<string, ErrorPresentation> = {
  provider_error: {
    label: 'Provider error',
    tone: 'error',
    icon: 'plug',
    hint: 'The upstream model provider failed (timeout, auth, or rate-limit).',
  },
  routing_error: {
    label: 'Routing error',
    tone: 'warning',
    icon: 'branch',
    hint: "The orchestrator couldn't classify the request.",
  },
  agent_error: {
    label: 'Agent error',
    tone: 'error',
    icon: 'bot',
    hint: "An agent's loop failed; the session stays open.",
  },
  tool_error: {
    label: 'Tool error',
    tone: 'warning',
    icon: 'tool',
    hint: 'A tool invocation returned an error.',
  },
  permission_error: {
    label: 'Permission error',
    tone: 'error',
    icon: 'shield',
    hint: 'A policy rejected the requested operation.',
  },
  config_error: {
    label: 'Configuration error',
    tone: 'error',
    icon: 'settings',
    hint: 'Invalid configuration — check API keys and endpoints in Settings.',
  },
  cancelled: {
    label: 'Cancelled',
    tone: 'info',
    icon: 'close',
    hint: 'The turn was cancelled.',
  },
  rate_limited: {
    label: 'Rate limited',
    tone: 'warning',
    icon: 'refresh',
    hint: 'Soft-limit backoff — this is transient and will retry.',
  },
  internal_error: INTERNAL_ERROR,
};

/**
 * Resolve a taxonomy code to its presentation. Unknown / vendor codes render
 * with the `internal_error` presentation but keep the original code as the
 * label so it round-trips visibly (SPEC §14.2).
 */
export function errorPresentation(code: string | undefined | null): ErrorPresentation {
  const key = (code ?? '').trim().toLowerCase();
  const known = TAXONOMY[key];
  if (known) return known;
  if (!key) return INTERNAL_ERROR;
  return { ...INTERNAL_ERROR, label: humanizeCode(key) };
}

/** Turn a snake_case taxonomy code into a Title Case label. */
function humanizeCode(code: string): string {
  return code
    .replace(/^x_[^_]+_/, '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Whether the error warrants an auto-retry affordance: recoverable AND the
 * backend supplied a positive `retry_after_s` hint (SPEC §14.1/§14.3).
 */
export function hasAutoRetryHint(errorInfo: {
  recoverable?: boolean;
  retry_after_s?: number | null;
}): boolean {
  return Boolean(errorInfo.recoverable) && (errorInfo.retry_after_s ?? 0) > 0;
}

/** Render a `retry_after_s` value as a compact "auto-retry in Ns" hint. */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 1) return 'Auto-retry shortly';
  const rounded = Math.round(seconds);
  return `Auto-retry in ${rounded}s`;
}
