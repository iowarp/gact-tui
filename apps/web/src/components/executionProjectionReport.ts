/**
 * Builds the report-node preview text for the execution-projection tree.
 */
import type { ProjectedExecutionNode } from './executionProjectionTypes.js';
import {
  imagePath,
  objectValue,
  parseJSON,
  stringValue,
} from './executionProjectionHelpers.js';
import { findBalancedJsonEnd } from '../presentationUtils.js';

/**
 * Build a node's report preview. BACKEND-AGNOSTIC: when the node carries prose,
 * show the prose. When it carries only a structured object (display-only state
 * per the contract — clients "never rely on specific keys"), summarise it
 * GENERICALLY into "key: value" rows + an inline image hint when any value is an
 * image path. No backend-specific key names (no acquisition / resource_candidate
 * / artifact / region_name / center_lat …).
 */
export function reportPreview(node: ProjectedExecutionNode): string {
  const prose = stripControlContracts(node.text ?? '').trim();
  const structured = Object.keys(objectValue(node.structured)).length
    ? objectValue(node.structured)
    : objectValue(parseJSON(prose) ?? {});
  const summary = summarizeStructured(structured);
  // A structured-state summary is the report node's content when present (it is
  // the display-only evidence). Otherwise fall back to the node's prose.
  if (summary) return summary;
  if (prose && !/^[[{]/.test(prose)) return prose;
  return summary || prose;
}

/** Generic "key: value" summary of an arbitrary structured object. Recurses
 *  into nested objects (capped) so deeply-wrapped leaf scalars still surface,
 *  with an image hint for any image-pathed value. No backend key knowledge. */
function summarizeStructured(obj: Record<string, unknown>): string {
  const rows: string[] = [];
  const visit = (record: Record<string, unknown>, depth: number) => {
    for (const [key, value] of Object.entries(record)) {
      if (rows.length >= 8) return;
      if (value == null) continue;
      if (typeof value === 'object' && !Array.isArray(value)) {
        if (depth < 3) visit(objectValue(value), depth + 1);
        continue;
      }
      const cell = scalarOrPath(value);
      if (cell) rows.push(`${key}: ${cell}`);
    }
  };
  visit(obj, 0);
  return rows.join('\n');
}

function scalarOrPath(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value.map((v) => stringValue(v)).filter(Boolean);
    return items.length ? items.slice(0, 6).join(', ') : '';
  }
  const text = stringValue(value);
  if (text && imagePath(text)) return `${text}\nshow full image`;
  return text;
}

/**
 * Recover a display-only structured-state object embedded in a text body. The
 * shape is detected STRUCTURALLY — a bare JSON object, optionally introduced by
 * a short single-line caption (`<caption>:\n{ … }`) — never by matching any
 * backend's marker text. Returns the parsed object, or {} when none is present.
 */
export function retainedWorkflowStateFromText(text: string): Record<string, unknown> {
  const brace = text.indexOf('{');
  if (brace < 0) return {};
  const head = text.slice(0, brace).trim();
  // Only treat trailing JSON as state when nothing but a short caption precedes
  // it (otherwise it is prose that happens to contain a brace).
  if (head && !/^[^\n{}]{0,80}:?$/.test(head)) return {};
  return objectValue(parseJSON(text.slice(brace)) ?? {});
}

/**
 * If a text body is (only) a structured object, summarise it generically;
 * otherwise return the text unchanged. Backend-agnostic — no key-name list.
 */
export function structuredAgentTextPreview(text: string): string {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return text;
  const parsed = objectValue(parseJSON(trimmed) ?? {});
  if (!Object.keys(parsed).length) return text;
  return reportPreview({ kind: 'report', agent: 'main', depth: 0, structured: parsed, text });
}

/** True when the text references an inline image artifact (by extension or the
 *  generic "show full image" affordance). No backend-specific vocabulary. */
export function carriesArtifact(text: string): boolean {
  return /(\.png|\.jpe?g|\.gif|\.webp|\.svg|\.bmp|full image)/i.test(text);
}

/**
 * Drop a trailing display-only structured-state blob from a prose body. The blob
 * is detected STRUCTURALLY: an optional short caption line immediately followed
 * by a balanced JSON object that runs to the end of the text. No backend marker
 * strings are matched.
 */
export function stripControlContracts(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  // A bare JSON body is left intact — summarising it is structuredAgentTextPreview's
  // job, not this stripper's. We only remove an embedded/trailing state blob that
  // is glued onto PROSE.
  if (/^[[{]/.test(trimmed)) return trimmed;
  // Find the last "caption:\n{" boundary; if the JSON from there is balanced and
  // runs to the end, strip the caption + blob.
  const m = /(^|\n)([^\n{}]{0,80}:)\s*\n?\s*\{/.exec(trimmed);
  if (m) {
    const braceIdx = trimmed.indexOf('{', m.index);
    if (braceIdx >= 0) {
      const end = findBalancedJsonEnd(trimmed, braceIdx);
      if (end >= 0 && trimmed.slice(end + 1).trim() === '') {
        return trimmed.slice(0, m.index).trim();
      }
    }
  }
  return trimmed;
}

export function normalizeComparable(text: string): string {
  return stripControlContracts(text).toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

export function normalizeLooseComparable(text: string): string {
  return stripControlContracts(text).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function textQualityScore(text: string): number {
  return text.trim().length + [...text].filter((ch) => ch === ' ' || ch === '\n' || ch === '\t').length * 2;
}
