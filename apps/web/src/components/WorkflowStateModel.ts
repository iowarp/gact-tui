/**
 * View-model / pure logic for Workflow State: state shaping and helpers, no DOM. Key export `WorkflowBlockerSummary`.
 */
import type { Part } from '@clio/core';
import { findBalancedJsonEnd, isRecord, splitWorkflowState } from './WorkflowStateParsing.js';
import {
  humanizeKey,
  knownWorkflowBlocker,
  shortScalar,
  summarizeEvidenceRecord,
  workflowDetail,
  workflowTone,
} from './WorkflowStateFormatting.js';

export {
  isRecord,
  prettyJson,
  splitWorkflowState,
} from './WorkflowStateParsing.js';
export {
  humanizeKey,
  knownWorkflowBlocker,
  shortScalar,
  summarizeEvidenceRecord,
  workflowDetail,
  workflowTone,
} from './WorkflowStateFormatting.js';
export type { WorkflowStateBlock } from './WorkflowStateParsing.js';

export interface WorkflowBlockerSummary {
  title: string;
  detail: string;
}

export interface WorkflowRow {
  label: string;
  status: string;
  tone: 'ok' | 'warn' | 'err' | 'idle';
  detail: string;
}

export function summarizeHandoffDetail(detail: string): string {
  const text = detail.trim();
  if (!text) return '';
  const jsonStart = text.search(/{/);
  if (jsonStart !== 0) return text;
  const end = findBalancedJsonEnd(text, 0);
  if (end < 0) return text;
  const raw = text.slice(0, end + 1);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return text.slice(end + 1).trimStart();
    const summary = summarizeEvidenceRecord(parsed);
    const rest = text.slice(end + 1).trimStart();
    return [summary, rest].filter(Boolean).join(' · ');
  } catch {
    return text;
  }
}

export function workflowRows(state: Record<string, unknown>): WorkflowRow[] {
  return Object.entries(state).map(([key, value]) => {
    if (!isRecord(value)) {
      return {
        label: humanizeKey(key),
        status: shortScalar(value),
        tone: 'idle',
        detail: '',
      };
    }
    const status = String(
      value['status'] ??
        value['state'] ??
        value['kind'] ??
        value['confidence'] ??
        'recorded',
    );
    return {
      label: humanizeKey(key),
      status,
      tone: workflowTone(status, value),
      detail: workflowDetail(value),
    };
  });
}

export function turnWorkflowBlocker(parts: Part[]): WorkflowBlockerSummary | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const state = workflowStateFromPart(parts[i]);
    if (!state) continue;
    const delegation = state['delegation'];
    if (!isRecord(delegation)) continue;
    if (workflowTone(String(delegation['status'] ?? ''), delegation) !== 'err') continue;
    const detail = knownWorkflowBlocker(delegation) || workflowDetail(delegation);
    if (!detail) continue;
    return {
      title: 'Workflow blocker',
      detail,
    };
  }
  return null;
}

function workflowStateFromPart(part: Part | undefined): Record<string, unknown> | null {
  const metadata = part?.metadata;
  if (!isRecord(metadata)) return null;
  const state = metadata['workflow_state'];
  if (isRecord(state)) return state;
  const partRecord: Record<string, unknown> = isRecord(part) ? part : {};

  const candidates = [
    metadata['output_summary'],
    metadata['return_output_summary'],
    metadata['local_output_summary'],
    partRecord['text'],
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const workflow = splitWorkflowState(candidate);
    if (workflow) return workflow.state;
  }
  return null;
}
