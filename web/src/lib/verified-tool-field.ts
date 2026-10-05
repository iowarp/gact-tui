import type { AttentionBlock, ToolInvocation } from '@clio/core/v3';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { toolResultText } from './attention-highlight-sources';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? '';
}

/** Captured JSON spacing is retained only when the current arguments still match. */
export function verifiedToolField(block: AttentionBlock, tool: ToolInvocation): string | undefined {
  let text: string | undefined;
  if (block.field === 'input' && block.source_text !== undefined) {
    try {
      if (canonical(JSON.parse(block.source_text)) === canonical(tool.input))
        text = block.source_text;
    } catch {
      return;
    }
  } else if (
    block.field === 'result' &&
    block.kind === 'tool_result' &&
    tool.output !== undefined
  ) {
    text = toolResultText(tool.output);
  }
  if (
    text === undefined ||
    !block.content_revision ||
    bytesToHex(sha256(new TextEncoder().encode(text))) !== block.content_revision
  )
    return;
  return text;
}
