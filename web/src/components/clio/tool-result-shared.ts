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
