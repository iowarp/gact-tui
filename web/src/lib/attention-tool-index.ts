import type { AttentionBlock, AttentionResult } from '@clio/core/v3';
import type { Message as DomainMessage, MessageBlock } from '@clio/core/v3';

/**
 * Groups one message's tool-related attention blocks (`thought`, `tool_input`,
 * `tool_result`) into one entry per tool step, and per-text-part blocks
 * (`user_text`, `assistant_text`) by their part id.
 *
 * The attention payload names each part by its own literal transcript id
 * (a tool call's `thought`/`tool_input` share one id; its `tool_result` has a
 * different one), while the client's reduced transcript merges a call and its
 * result into one `ToolInvocation` card addressed by `tool_id`. Text parts
 * pass through as `text` blocks with the same id as their part, so those
 * match directly. Tool fields are grouped by the server's recorded call_id.
 * Missing identities are left unmapped; display order never supplies identity.
 */
export interface MessageAttentionIndex {
  /** Text-part blocks (`user_text` | `assistant_text`), keyed by part id. */
  textBlocksByPartId: ReadonlyMap<string, AttentionBlock>;
  /** This message's tool-kind attention blocks, in order, per tool invocation id (`tool_id`, aka `ToolInvocation.id`). */
  toolStepsByToolId: ReadonlyMap<string, readonly AttentionBlock[]>;
  /** The heaviest single tool step's summed share, in this message — the scale a tool badge buckets against. */
  maxToolStepShare: number;
  /**
   * The exact selected span's own part id and field, when this message is the
   * one the selection came from. The server rarely emits a self-referential
   * attention block for the selection's own text (attending to a token from
   * itself is not meaningful), so this is the only way to still mark that
   * text for the "selected" highlight — `textBlocksByPartId` alone would miss it.
   */
  selectionPartId?: string;
  selectionField?: string;
}

const TOOL_KINDS = new Set(['thought', 'tool_input', 'tool_result']);

export function groupToolSteps(blocks: readonly AttentionBlock[]): AttentionBlock[][] {
  const steps = new Map<string, AttentionBlock[]>();
  for (const block of blocks) {
    if (!block.call_id) continue;
    const current = steps.get(block.call_id) ?? [];
    current.push(block);
    steps.set(block.call_id, current);
  }
  return [...steps.values()];
}

export function buildMessageAttentionIndex(
  payload: AttentionResult,
  message: Pick<DomainMessage, 'id' | 'blocks'>,
): MessageAttentionIndex {
  if (!payload.available) {
    return { textBlocksByPartId: new Map(), toolStepsByToolId: new Map(), maxToolStepShare: 0 };
  }
  const messageBlocks = payload.blocks.filter((block) => block.message_id === message.id);
  const textBlocksByPartId = new Map<string, AttentionBlock>();
  const toolBlocks: AttentionBlock[] = [];
  for (const block of messageBlocks) {
    if (block.kind === 'user_text' || block.kind === 'assistant_text') {
      textBlocksByPartId.set(block.part_id, block);
    } else if (TOOL_KINDS.has(block.kind)) {
      toolBlocks.push(block);
    }
  }
  const steps = groupToolSteps(toolBlocks);
  const toolIds = new Set(
    message.blocks
      .filter((block): block is Extract<MessageBlock, { type: 'tool' }> => block.type === 'tool')
      .map((block) => block.tool_id),
  );
  const toolStepsByToolId = new Map<string, readonly AttentionBlock[]>();
  let maxToolStepShare = 0;
  for (const step of steps) {
    const callId = step[0]?.call_id;
    if (!callId || !toolIds.has(callId)) continue;
    toolStepsByToolId.set(callId, step);
    maxToolStepShare = Math.max(maxToolStepShare, toolStepShare(step));
  }
  const isSelectionMessage = payload.message_id === message.id;
  return {
    textBlocksByPartId,
    toolStepsByToolId,
    maxToolStepShare,
    selectionPartId: isSelectionMessage ? payload.selection.part_id : undefined,
    selectionField: isSelectionMessage ? payload.selection.field : undefined,
  };
}

/** Sum of `share` across a tool step's blocks, the value a card's badge intensity buckets against. */
export function toolStepShare(entries: readonly AttentionBlock[] | undefined): number {
  return (entries ?? []).reduce((total, block) => total + block.share, 0);
}
