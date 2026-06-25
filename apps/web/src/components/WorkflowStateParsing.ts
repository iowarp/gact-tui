/**
 * Workflow State parsing helpers (pure).
 */
import { findBalancedJsonEnd, isRecord } from '../presentationUtils.js';

export { findBalancedJsonEnd, isRecord };

export interface WorkflowStateBlock {
  before: string;
  after: string;
  raw: string;
  state: Record<string, unknown>;
}

/**
 * Split a text body into its prose `before`, an embedded structured-state object,
 * and the prose `after`. BACKEND-AGNOSTIC: the embedded state is detected
 * STRUCTURALLY — a short single-line caption (`<caption>:`) immediately followed
 * by a balanced JSON object — never by matching any backend's marker text. The
 * caption is whatever precedes the JSON on its own line; we do not interpret it.
 */
export function splitWorkflowState(text: string): WorkflowStateBlock | null {
  // Find a "<short caption line>:\n{" boundary anywhere in the body.
  const m = /(^|\n)([^\n{}]{0,80}:)[ \t]*\n?[ \t]*\{/.exec(text);
  if (!m) return null;
  const captionStart = m.index + (m[1] ? m[1].length : 0);
  const jsonStart = text.indexOf('{', m.index);
  if (jsonStart < 0) return null;
  const end = findBalancedJsonEnd(text, jsonStart);
  if (end < 0) return null;

  const before = text.slice(0, captionStart).trimEnd();
  const raw = text.slice(jsonStart, end + 1);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    // A nested `workflow_state` wrapper (when the backend uses one) is unwrapped
    // generically; otherwise the object itself is the state.
    const state = isRecord(parsed['workflow_state']) ? parsed['workflow_state'] : parsed;
    return {
      before,
      after: text.slice(end + 1).trimStart(),
      raw,
      state,
    };
  } catch {
    return null;
  }
}

export function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
