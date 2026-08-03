/**
 * Workflow-state formatting helpers (pure) — BACKEND-AGNOSTIC.
 *
 * `metadata.workflow_state` is DISPLAY-ONLY: the contract (contract/SPEC.md) says
 * clients "never rely on specific keys". So these helpers render the structure
 * GENERICALLY — humanised key/value projections — and NEVER string-match a
 * backend's status vocabulary, evidence-record keys, or error codes. Tone is
 * derived only from the STRUCTURAL presence of a generic error/blocker field, not
 * from matching arbitrary status prose.
 */
import { humanizeKey, isRecord, shortScalar as shortScalarBase } from '../presentationUtils.js';
import type { WorkflowRow } from './WorkflowStateModel.js';

export { humanizeKey };

/** Workflow-state scalars cap strings at 90 chars and render coordinates with `toFixed(4)`. */
export function shortScalar(value: unknown): string {
  return shortScalarBase(value, {
    maxLen: 90,
    formatNumber: (n) => (Number.isInteger(n) ? String(n) : n.toFixed(4)),
  });
}

/**
 * A generic one-line summary of an evidence/handoff record: the first few
 * non-empty scalar fields as `Humanised Key: value`, joined by `·`. No
 * backend-specific keys.
 */
export function summarizeEvidenceRecord(record: Record<string, unknown>): string {
  return Object.entries(record)
    .filter(([, value]) => value != null && value !== '' && !isRecord(value))
    .slice(0, 5)
    .map(([key, value]) => `${humanizeKey(key)}: ${shortScalar(value)}`)
    .filter((bit) => !bit.endsWith(': '))
    .join(' · ');
}

/**
 * Tone for a workflow-state row. Derived STRUCTURALLY, never by matching status
 * prose: a non-empty generic `error`/`blocker` field marks the row as an error;
 * an explicit boolean `ok: false` does the same; otherwise the row is neutral.
 */
export function workflowTone(
  _status: string,
  value: Record<string, unknown>,
): WorkflowRow['tone'] {
  const blocker = value['error'] ?? value['blocker'];
  if (typeof blocker === 'string' && blocker.trim()) return 'err';
  if (isRecord(blocker) || (Array.isArray(blocker) && blocker.length)) return 'err';
  if (value['ok'] === false || value['failed'] === true) return 'err';
  return 'idle';
}

/**
 * A generic detail line for a workflow-state row: the first few non-empty scalar
 * (or short-array) fields as `Humanised Key: value`. No hardcoded key list —
 * iterates the object's own keys.
 */
export function workflowDetail(value: Record<string, unknown>): string {
  const bits: string[] = [];
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null || raw === '' || isRecord(raw)) continue;
    const formatted = Array.isArray(raw)
      ? raw.slice(0, 3).map(shortScalar).join(', ')
      : shortScalar(raw);
    if (!formatted) continue;
    bits.push(`${humanizeKey(key)}: ${formatted}`);
    if (bits.length >= 3) break;
  }
  return bits.join(' · ');
}
