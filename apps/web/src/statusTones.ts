/**
 * Centralised status→tone mappings.
 *
 * Round 3 introduced the shared {@link statusTone} primitive but left the
 * per-component lookup tables and tone ternaries scattered across the inspector,
 * memory-health, and doctor surfaces. This module is the single home for those
 * tables: each exported function preserves the exact tone its original call site
 * produced (same mapping, same fallback), so swapping the call sites over is a
 * behaviour-preserving refactor.
 */
import { statusTone } from './presentationUtils.js';

/** Doctor-page / subsystem tone vocabulary (`''` = neutral). */
export type DoctorTone = 'ok' | 'warn' | 'err' | '';

/** Memory-pressure tone vocabulary. */
export type PressureTone = 'ok' | 'warn' | 'err' | 'idle';

/** Inspector chip tone vocabulary. */
export type ChipTone = 'ok' | 'err';

/** Retry-attempt status → inspector chip tone: only failed/cancelled read as errors. */
export const ATTEMPT_TONES: Readonly<Record<string, ChipTone>> = {
  failed: 'err',
  cancelled: 'err',
};

/** stop_reason → inspector chip tone: only `error` is a failure; anything else reads as ok. */
export const STOP_REASON_TONES: Readonly<Record<string, ChipTone>> = {
  error: 'err',
};

/** Packaged-binding trust label → inspector chip tone. */
export const TRUST_TONES: Readonly<Record<string, ChipTone>> = {
  enabled: 'ok',
  disabled: 'err',
};

/** Backend coarse `threshold_state` bucket → memory-pressure tone. */
export const THRESHOLD_TONES: Readonly<Record<string, PressureTone>> = {
  critical: 'err',
  warning: 'warn',
  normal: 'ok',
  empty: 'idle',
};

/** Per-integration health status → doctor tone. */
export const HEALTH_TONES: Readonly<Record<string, DoctorTone>> = {
  ready: 'ok',
  degraded: 'warn',
  unavailable: 'err',
};

/** LSP server status → doctor tone. */
export const LSP_TONES: Readonly<Record<string, DoctorTone>> = {
  ready: 'ok',
  running: 'ok',
  starting: 'warn',
};

/** Overall backend status → doctor/pip tone. `healthy`/`ready` are both ok. */
export const OVERALL_TONES: Readonly<Record<string, DoctorTone>> = {
  healthy: 'ok',
  ready: 'ok',
  degraded: 'warn',
  unavailable: 'err',
};

/** Retry-attempt status → chip tone. Unknown statuses read as ok. */
export function attemptTone(status: string | undefined): ChipTone {
  return statusTone(status, ATTEMPT_TONES, 'ok');
}

/** stop_reason → chip tone. Unknown reasons read as ok. */
export function stopReasonTone(reason: string | undefined): ChipTone {
  return statusTone(reason, STOP_REASON_TONES, 'ok');
}

/** Packaged-binding trust label → chip tone. Unknown labels read as err. */
export function trustTone(label: string | undefined): ChipTone {
  return statusTone(label, TRUST_TONES, 'err');
}

/** `threshold_state` bucket → memory-pressure tone. Unknown/absent buckets read as idle. */
export function thresholdTone(state: string | undefined): PressureTone {
  return statusTone(state, THRESHOLD_TONES, 'idle');
}

/** Per-integration health status → doctor tone. Unknown/absent statuses are neutral. */
export function healthTone(status: string | undefined): DoctorTone {
  return statusTone(status, HEALTH_TONES, '');
}

/** LSP server status → doctor tone. Unknown-but-present statuses are an error; absent is neutral. */
export function lspTone(status?: string): DoctorTone {
  return statusTone(status, LSP_TONES, status ? 'err' : '');
}

/** Overall backend status → doctor/pip tone. Unknown/absent statuses are neutral. */
export function overallTone(status: string | undefined): DoctorTone {
  return statusTone(status, OVERALL_TONES, '');
}
