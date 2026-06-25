/**
 * Presentation helpers for the transcript and inspector.
 *
 * Tool RESULTS are rendered backend-agnostically by their detected CONTENT TYPE
 * (see {@link ./components/toolResultContent.ts} and the shared
 * {@link ./components/ToolResultContentView.tsx} renderer) — never by the tool's
 * name or any backend-specific key vocabulary (contract/SPEC.md). The only
 * helper that survives here is {@link toolInputRows}, a generic key/value
 * projection of a tool call's INPUT object.
 */
import { humanizeKey, shortScalar } from './presentationUtils.js';

export function toolInputRows(input: Record<string, unknown> | undefined): Array<{ label: string; value: string }> {
  if (!input) return [];
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 8)
    .map(([key, value]) => ({ label: humanizeKey(key), value: shortScalar(value) }));
}
