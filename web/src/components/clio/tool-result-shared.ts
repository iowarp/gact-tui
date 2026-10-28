import type { ToolPresentationBlock } from '@clio/core/v3';

/**
 * Provenance blocks (`input-source-<i>` links, the `provenance-incomplete`
 * warning) are appended by the backend after the declared presentation
 * contract (#1336) to record which external files a tool read. They must
 * never affect the document fast-path decision below.
 */
export function isProvenanceBlock(block: ToolPresentationBlock): boolean {
  return block.id.startsWith('input-source-') || block.id === 'provenance-incomplete';
}

/** Unwrap a complete recorded object or one JSON text block; never parse bounded previews. */
export function toolResultRecord(value: unknown): Record<string, unknown> | undefined {
  const output = asRecord(value);
  if (output?.truncated) return output;
  const structured =
    output &&
    (asRecord(output.structuredContent) ??
      asRecord(output.structured_content) ??
      asRecord(output.result));
  if (structured) return structured;
  const blocks = Array.isArray(value) ? value : output?.content;
  if (Array.isArray(blocks) && blocks.length === 1) {
    const block = asRecord(blocks[0]);
    if (block?.type === 'text' && typeof block.text === 'string') {
      try {
        return asRecord(JSON.parse(block.text)) ?? output;
      } catch {
        return output;
      }
    }
  }
  return output;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
