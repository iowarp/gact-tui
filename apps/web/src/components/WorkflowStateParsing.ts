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

const WORKFLOW_STATE_MARKERS = [
  'CLIO durable typed workflow state:',
  'CLIO typed workflow state:',
  'Retained typed workflow state:',
] as const;

export function splitWorkflowState(text: string): WorkflowStateBlock | null {
  let markerIndex = -1;
  let marker = '';
  for (const candidate of WORKFLOW_STATE_MARKERS) {
    const idx = text.indexOf(candidate);
    if (idx >= 0 && (markerIndex < 0 || idx < markerIndex)) {
      markerIndex = idx;
      marker = candidate;
    }
  }
  if (markerIndex < 0) return null;

  const before = text.slice(0, markerIndex).trimEnd();
  const tail = text.slice(markerIndex + marker.length).trimStart();
  const jsonStart = tail.indexOf('{');
  if (jsonStart < 0) return null;
  const end = findBalancedJsonEnd(tail, jsonStart);
  if (end < 0) return null;

  const raw = tail.slice(jsonStart, end + 1);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const state = isRecord(parsed['workflow_state']) ? parsed['workflow_state'] : parsed;
    return {
      before,
      after: tail.slice(end + 1).trimStart(),
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
