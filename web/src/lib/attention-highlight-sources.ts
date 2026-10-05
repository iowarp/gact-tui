import type {
  AttentionAvailable,
  AttentionBlock,
  Message as DomainMessage,
  MessageBlock,
  ToolInvocation,
} from '@clio/core/v3';
import { buildMessageAttentionIndex } from './attention-tool-index';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface ResolvedAttentionBlock {
  block: AttentionBlock;
  /** The raw source text `block.runs` are char-offsets into (markdown source, thought, JSON input, or result text). */
  sourceText: string;
}

/** Best-effort text extraction from an arbitrary tool result shape, mirroring how `ToolOutput` renders it. */
export function toolResultText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object') {
    const content = Array.isArray(output) ? output : (output as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const text = content
        .filter(
          (item): item is { type: string; text: string } =>
            Boolean(item) &&
            typeof item === 'object' &&
            (item as { type?: unknown }).type === 'text',
        )
        .map((item) => item.text)
        .join('\n');
      if (text) return text;
    }
  }
  try {
    return JSON.stringify(output);
  } catch {
    return '';
  }
}

function toolInputText(input: unknown): string {
  try {
    return JSON.stringify(input ?? {});
  } catch {
    return '';
  }
}

/** The raw source text of one message's `text`-type part, or `undefined` if it is not loaded. */
export function findTextPartSource(
  messages: readonly DomainMessage[],
  messageId: string,
  partId: string,
): string | undefined {
  const message = messages.find((candidate) => candidate.id === messageId);
  const part = message?.blocks.find((candidate) => candidate.id === partId);
  return part?.type === 'text' ? part.text : undefined;
}

/**
 * Resolves each attention block that carries at least one heat run to the raw
 * source text it is offset into, using the live transcript (`messages`,
 * `tools`) as the source of truth. A block whose message, tool, or field is
 * not currently loaded is dropped rather than guessed at.
 */
export function resolveAttentionSources(
  data: AttentionAvailable,
  messages: readonly DomainMessage[],
  tools: Record<string, ToolInvocation>,
): ResolvedAttentionBlock[] {
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const blocksByMessage = new Map<string, AttentionBlock[]>();
  for (const block of data.blocks) {
    if (block.runs.length === 0) continue;
    const bucket = blocksByMessage.get(block.message_id);
    if (bucket) bucket.push(block);
    else blocksByMessage.set(block.message_id, [block]);
  }

  const resolved: ResolvedAttentionBlock[] = [];
  for (const [messageId, blocks] of blocksByMessage) {
    const message = messagesById.get(messageId);
    if (!message) continue;
    const index = buildMessageAttentionIndex(data, message);
    const toolIdByEntry = new Map<AttentionBlock, string>();
    for (const [toolId, entries] of index.toolStepsByToolId) {
      for (const entry of entries) toolIdByEntry.set(entry, toolId);
    }
    for (const block of blocks) {
      if (block.kind === 'user_text' || block.kind === 'assistant_text') {
        const part = message.blocks.find((candidate) => candidate.id === block.part_id);
        if (part?.type === 'text') resolved.push({ block, sourceText: part.text });
        continue;
      }
      const toolId = toolIdByEntry.get(block);
      const toolBlock = toolId
        ? message.blocks.find(
            (candidate): candidate is Extract<MessageBlock, { type: 'tool' }> =>
              candidate.type === 'tool' && candidate.tool_id === toolId,
          )
        : undefined;
      if (toolBlock?.type !== 'tool') continue;
      const tool = tools[toolBlock.tool_id];
      if (block.kind === 'thought') {
        if (toolBlock.thought) resolved.push({ block, sourceText: toolBlock.thought });
      } else if (block.kind === 'tool_input') {
        if (tool?.input !== undefined)
          resolved.push({ block, sourceText: block.source_text ?? toolInputText(tool.input) });
      } else if (block.kind === 'tool_result') {
        if (tool?.output !== undefined) {
          const text = toolResultText(tool.output);
          if (text) resolved.push({ block, sourceText: text });
        }
      }
    }
  }
  return resolved.filter(
    ({ block, sourceText }) =>
      !block.content_revision ||
      bytesToHex(sha256(new TextEncoder().encode(sourceText))) === block.content_revision,
  );
}
