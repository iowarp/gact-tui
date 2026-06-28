/**
 * Core execution-projection model: folds raw transcript/events into the
 * `projectedTranscriptMessages` (the synthetic execution_tree parts).
 */
import type { Message, Part } from '@clio/core';
import type { ExecutionTranscriptEvent } from '../live.js';
import { type ProjectedExecutionNode } from './executionProjectionPreview.js';
import { projectWebExecutionTimeline } from './executionProjectionTimeline.js';
import {
  assistantSupplementNodesByTurn,
  dedupeProjectedSupplements,
} from './executionProjectionSupplements.js';

export function projectedTranscriptMessages(
  messages: Message[],
  events?: ExecutionTranscriptEvent[],
): Message[] {
  const turns = projectWebExecutionTurns(events ?? []);
  if (turns.length === 0) return messages;
  const keyed = new Map(
    turns.filter((turn) => turn.turnId).map((turn) => [turn.turnId, turn.nodes]),
  );
  const unscoped = turns.filter((turn) => !turn.turnId).map((turn) => turn.nodes);
  const supplements = assistantSupplementNodesByTurn(messages);
  let unscopedIdx = 0;
  const projected: Message[] = [];
  for (const message of messages) {
    if (message.role !== 'user') continue;
    projected.push(message);
    let nodes = keyed.get(message.id);
    if (!nodes && unscopedIdx < unscoped.length) {
      nodes = unscoped[unscopedIdx++];
    }
    const turnSupplements = supplements.get(message.id) ?? [];
    if (turnSupplements.length) {
      nodes = dedupeProjectedSupplements(nodes ?? [], turnSupplements);
    }
    if (nodes?.length) {
      projected.push({
        id: `execution-projected-assistant-${message.id}`,
        role: 'assistant',
        parts: [executionTreePart(nodes)],
      } satisfies Message);
    }
  }
  for (; unscopedIdx < unscoped.length; unscopedIdx++) {
    const nodes = unscoped[unscopedIdx];
    if (!nodes) continue;
    projected.push({
      id: `execution-projected-assistant-unscoped-${unscopedIdx}`,
      role: 'assistant',
      parts: [executionTreePart(nodes)],
    } satisfies Message);
  }
  return projected;
}

/**
 * Synthetic transcript Part carrying the projected execution nodes. Dispatched
 * in TranscriptParts.PartView, where `buildTurnModelFromNodes` converts the
 * nodes into the clean AssistantTurnModel and renders them through
 * AssistantTurnView — the SAME flat, depth-indented, content-typed path the
 * persisted message uses (RENDERING_SPEC §9). Live render === post-reload.
 */
export interface PartExecutionTree {
  type: 'execution_tree';
  nodes: ProjectedExecutionNode[];
}

function executionTreePart(nodes: ProjectedExecutionNode[]): Part {
  return { type: 'execution_tree', nodes } as unknown as Part;
}

interface ProjectedExecutionTurn {
  turnId: string;
  nodes: ProjectedExecutionNode[];
}

function projectWebExecutionTurns(events: ExecutionTranscriptEvent[]): ProjectedExecutionTurn[] {
  if (!events.some(isTranscriptProjectionEvent)) return [];
  const buckets = new Map<string, ExecutionTranscriptEvent[]>();
  const firstSequence = new Map<string, number>();
  for (const event of events) {
    const key = event.turnId?.trim() || '__unscoped__';
    buckets.set(key, [...(buckets.get(key) ?? []), event]);
    firstSequence.set(key, Math.min(firstSequence.get(key) ?? event.sequence, event.sequence));
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (firstSequence.get(a) ?? 0) - (firstSequence.get(b) ?? 0))
    .map(([key, bucketEvents]) => ({
      turnId: key === '__unscoped__' ? '' : key,
      nodes: projectWebExecutionTimeline(bucketEvents),
    }))
    .filter((turn) => turn.nodes.length > 0);
}

function isTranscriptProjectionEvent(event: ExecutionTranscriptEvent): boolean {
  return [
    'react.step.completed',
    'expert.extract.completed',
    'blueprint.delegation.started',
  ].includes(event.type);
}
