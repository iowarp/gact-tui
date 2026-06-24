/**
 * Formats tool args/observations into short preview strings for execution
 * tree nodes.
 */
import {
  compactValue,
  isRedacted,
  objectValue,
  toolDisplayName,
} from './executionProjectionHelpers.js';
import { observationPreview } from './executionObservationPreview.js';
import {
  reportPreview,
  structuredAgentTextPreview,
  stripControlContracts,
} from './executionProjectionReport.js';
import type { ProjectedExecutionNode } from './executionProjectionTypes.js';

export {
  agentDepth,
  handoffDepth,
  isRedacted,
  objectValue,
  stringValue,
  toolDisplayName,
} from './executionProjectionHelpers.js';
export { observationPreview } from './executionObservationPreview.js';
export {
  carriesArtifact,
  normalizeComparable,
  normalizeLooseComparable,
  reportPreview,
  retainedWorkflowStateFromText,
  stripControlContracts,
  textQualityScore,
} from './executionProjectionReport.js';
export type { ProjectedExecutionNode } from './executionProjectionTypes.js';

export function formatArgs(args: unknown): string {
  const obj = objectValue(args);
  const parts = Object.keys(obj).sort().map((key) => `${key}: ${compactValue(obj[key])}`).filter((v) => !isRedacted(v));
  return parts.length ? `(${parts.join(' · ')})` : '';
}

export function formatProjectedExecution(nodes: ProjectedExecutionNode[]): string {
  const rows: string[] = [];
  for (const node of nodes) {
    if (rows.length > 0 && (node.kind === 'text' || node.kind === 'report')) rows.push('');
    const indent = '  '.repeat(Math.max(0, node.depth));
    if (node.kind === 'text') {
      rows.push(`${indent}${node.agent || 'main'}`);
      pushWrapped(rows, node.text ?? '', `${indent}  `);
    } else if (node.kind === 'handoff') {
      rows.push(`${indent}↳ ${node.parent || 'main'} → ${node.agent}`);
      pushWrapped(rows, node.question ?? '', `${indent}  `);
    } else if (node.kind === 'step') {
      const text = node.reasoning ? `${node.text ?? ''} · show reasoning trace` : node.text ?? '';
      pushWrapped(rows, text, indent);
      if (node.toolName && !node.isFinish) {
        rows.push(`${indent}${toolDisplayName(node.toolName)}${formatArgs(node.toolArgs)}`);
        const obs = observationPreview(node.toolName, node.observation);
        if (obs) pushWrapped(rows, `⎿ ${obs}`, `${indent}  `);
      }
    } else if (node.kind === 'report') {
      rows.push(`${indent}${node.agent} returned evidence`);
      pushWrapped(rows, reportPreview(node), `${indent}  `);
    }
  }
  return rows.join('\n').trim();
}

function pushWrapped(rows: string[], text: string, prefix: string) {
  const clean = structuredAgentTextPreview(stripControlContracts(text));
  if (!clean) return;
  for (const line of clean.split('\n')) {
    rows.push(prefix + line);
  }
}
