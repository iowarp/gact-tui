import type { ToolPresentationBlock } from '@clio/core/v3';

/** One found page or work read from a producer's link and the line that follows it. */
export interface LinkedMatchRow {
  title: string;
  url: string;
  snippet?: string;
}

/** A run of linked matches in a presentation, from its first block to just past its last. */
export interface LinkedMatchRun {
  start: number;
  end: number;
  rows: LinkedMatchRow[];
}

const isWebLink = (block: ToolPresentationBlock | undefined) =>
  block?.type === 'link' && block.target === 'url' && Boolean(block.uri);

/** Plain prose that belongs to the link before it: no label, no outcome, nothing to page. */
const isAnnotation = (block: ToolPresentationBlock | undefined) =>
  block?.type === 'text' &&
  !block.label &&
  !block.severity &&
  !block.content_ref &&
  Boolean(block.text?.trim());

/**
 * Runs of two or more web links, each optionally followed by its own line of text (a
 * search hit and its snippet, a work and its citation). Producers list found pages this
 * way; the shared search reader shows each run as one paged list instead of a block per
 * line, so a large result stays bounded.
 */
export function linkedMatchRuns(blocks: readonly ToolPresentationBlock[]): LinkedMatchRun[] {
  const runs: LinkedMatchRun[] = [];
  let index = 0;
  while (index < blocks.length) {
    if (!isWebLink(blocks[index])) {
      index += 1;
      continue;
    }
    const start = index;
    const rows: LinkedMatchRow[] = [];
    while (isWebLink(blocks[index])) {
      const link = blocks[index]!;
      const note = isAnnotation(blocks[index + 1]) ? blocks[index + 1] : undefined;
      rows.push({
        title: link.label || link.uri || '',
        url: link.uri ?? '',
        ...(note?.text ? { snippet: note.text } : {}),
      });
      index += note ? 2 : 1;
    }
    if (rows.length >= 2) runs.push({ start, end: index, rows });
  }
  return runs;
}
