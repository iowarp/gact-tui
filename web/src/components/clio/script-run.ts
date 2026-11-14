import type { ToolPresentationBlock } from '@clio/core/v3';
import { type WorkspaceImage, workspaceImages } from './image-reach';
import { parsePrintedValue } from './python-literal';

/** A file the script viewed, which rode its result to the model (`attached-N`). */
export const attached = (block: ToolPresentationBlock) => block.id.startsWith('attached-');

/** A background script's link to its task under Work; its sentence names the raw handle. */
export const backgroundTaskLink = (block: ToolPresentationBlock) =>
  block.type === 'link' && block.target === 'task' && Boolean(block.uri);

/** The name the agent gave its script (`label`), which its background task carries. */
export function scriptLabel(input: unknown): string | undefined {
  const label =
    input && typeof input === 'object' ? (input as { label?: unknown }).label : undefined;
  return typeof label === 'string' && label.trim() ? label.trim() : undefined;
}

/** A run_code call's own blocks: its source, what it returned or printed, what it showed the model. */
export function isScriptBody(blocks: readonly ToolPresentationBlock[]): boolean {
  return (
    blocks.some((block) => block.type === 'code') &&
    blocks.every(
      (block) =>
        (!block.severity || (block.severity === 'error' && block.type === 'text')) &&
        (block.type === 'code' ||
          block.type === 'text' ||
          backgroundTaskLink(block) ||
          (block.type === 'workspace_file' && attached(block) && !block.content_ref)),
    )
  );
}

/** The agent's notes to the model after a script's output; the row already shows both. */
const AGENT_NOTES = [/^\(Script finished; \d+ tool calls?\.\)$/u, /^\(Attached below: .*\)$/u];

export type PrintedLine =
  | { kind: 'text'; text: string }
  | { kind: 'image'; text: string; images: WorkspaceImage[] };

/**
 * A script's printed output line by line: a line that prints an image descriptor
 * reads as that image, and the agent's own notes to the model are left out.
 */
export function printedLines(text: string): PrintedLine[] {
  return text
    .replace(/\r\n?/gu, '\n')
    .replace(/\s+$/u, '')
    .split('\n')
    .filter((line) => !AGENT_NOTES.some((note) => note.test(line.trim())))
    .map((line) => {
      const parsed = /^\s*[{[]/u.test(line) ? parsePrintedValue(line) : undefined;
      const images = parsed ? workspaceImages(parsed.value) : undefined;
      return images ? { kind: 'image', text: line, images } : { kind: 'text', text: line };
    });
}
