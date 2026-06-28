/**
 * DEPRECATED live-path shim.
 *
 * The transcript no longer substitutes a separately-projected `execution_tree`
 * synthetic part for an assistant turn. Both the live and the persisted render
 * now build a single APPEND-ONLY ordered row log directly from the message's
 * real parts (see {@link buildAssistantTurnModel} in transcriptDelegationModel),
 * which preserves wire-arrival order and never re-groups/re-orders the turn.
 *
 * This stub remains only so the (now unreachable) `execution_tree` part renderer
 * in TranscriptParts still type-checks; it always defers to the normal render.
 */
import type { ProjectedExecutionNode } from './executionProjectionTypes.js';
import type { AssistantTurnModel } from './transcriptDelegationModel.js';

export function buildTurnModelFromNodes(
  _nodes: readonly ProjectedExecutionNode[],
): AssistantTurnModel | null {
  return null;
}
