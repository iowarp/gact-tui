/**
 * Computes per-turn supplement nodes (assistant additions) layered onto the
 * projected execution tree.
 */
import type { Message } from '@clio/core';
import {
  agentDepth,
  carriesArtifact,
  normalizeComparable,
  objectValue,
  type ProjectedExecutionNode,
  reportPreview,
  retainedWorkflowStateFromText,
  stringValue,
  stripControlContracts,
} from './executionProjectionPreview.js';

export function assistantSupplementNodesByTurn(
  messages: Message[],
): Map<string, ProjectedExecutionNode[]> {
  const out = new Map<string, ProjectedExecutionNode[]>();
  let currentTurnId = '';
  for (const message of messages) {
    if (message.role === 'user') {
      currentTurnId = message.id;
      continue;
    }
    if (message.role !== 'assistant' || !currentTurnId) continue;
    const nodes = assistantSupplementNodes(message);
    if (nodes.length) out.set(currentTurnId, [...(out.get(currentTurnId) ?? []), ...nodes]);
  }
  return out;
}

export function assistantSupplementNodes(message: Message): ProjectedExecutionNode[] {
  const nodes: ProjectedExecutionNode[] = [];
  for (const part of message.parts ?? []) {
    if (part.type === 'text') {
      const text = stripControlContracts(part.text ?? '');
      if (text && carriesArtifact(text))
        nodes.push({ kind: 'text', agent: 'main', depth: 0, text });
      continue;
    }
    if (part.type === 'expert_handoff') {
      const metadata = objectValue(part.metadata);
      const text = stringValue(part.text);
      const structured = objectValue(metadata['structured']);
      const retained = retainedWorkflowStateFromText(text);
      const agent = stringValue(metadata['agent_id']) || stringValue(metadata['delegate_to']);
      const node: ProjectedExecutionNode = {
        kind: 'report',
        agent: agent || 'expert',
        parent: stringValue(metadata['parent_id']) || stringValue(metadata['parent']),
        depth: agentDepth(agent),
        text,
        structured: Object.keys(structured).length ? structured : retained,
      };
      const preview = reportPreview(node);
      if (carriesArtifact(preview)) nodes.push({ ...node, text: preview });
      continue;
    }
    if (part.type === 'image') {
      const raw = part as unknown as Record<string, unknown>;
      const path = stringValue(raw['uri']) || stringValue(objectValue(raw['metadata'])['path']);
      nodes.push({
        kind: 'report',
        agent: 'artifact',
        depth: 1,
        text: ['image artifact', path, path ? 'show full image' : ''].filter(Boolean).join('\n'),
      });
    }
  }
  return nodes;
}

export function dedupeProjectedSupplements(
  existing: ProjectedExecutionNode[],
  supplements: ProjectedExecutionNode[],
): ProjectedExecutionNode[] {
  let comparable = existing.map(nodeComparableText).map(normalizeComparable).join(' ');
  const out = [...existing];
  for (const node of supplements) {
    const text = normalizeComparable(nodeComparableText(node));
    if (!text || comparable.includes(text)) continue;
    out.push(node);
    comparable += ` ${text}`;
  }
  return out;
}

function nodeComparableText(node: ProjectedExecutionNode): string {
  return node.text || node.question || '';
}
