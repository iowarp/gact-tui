import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { t } from '@lingui/core/macro';
import { STRUCTURED_RESULT_BLOCK, outlineValue } from './structured-result-reading';
import { asRecord, toolResultRecord } from './tool-result-shared';

/**
 * The person said no to what a call asked, so it did nothing: their decision, not a
 * failure. Relay says so as `declined: {operation_id, ask_id, question, not_done}` in a
 * result (`structuredContent.declined`) or an operation view (state `cancelled`, no error).
 */
export interface ToolDecline {
  question: string;
  /** What was therefore not done, in the producer's words. */
  notDone: string;
  operationId?: string;
}

// Relay's text for the same result: "Declined: <question>\n<not done>".
const DECLINED_TEXT = /^Declined: ([^\n]+)(?:\n([\s\S]+))?$/u;
// An older relay refused instead: "… is cancelled. declined: the person declined: <question>".
const DECLINED_REFUSAL = /\bdeclined: the (?:person|user) declined(?::\s*([\s\S]+))?$/u;

function prose(block: ToolPresentationBlock): string {
  return block.type === 'text' || block.type === 'markdown' ? (block.text?.trim() ?? '') : '';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readDecline(value: unknown): ToolDecline | undefined {
  const row = asRecord(value);
  if (!row) return undefined;
  const question = text(row.question);
  const notDone = text(row.not_done);
  if (!question && !notDone) return undefined;
  const operationId = text(row.operation_id);
  return { question, notDone, ...(operationId ? { operationId } : {}) };
}

/** A block that only says the call was declined, which the decline itself replaces. */
export function isDeclineBlock(block: ToolPresentationBlock): boolean {
  const value = prose(block);
  return (
    block.id === STRUCTURED_RESULT_BLOCK ||
    DECLINED_TEXT.test(value) ||
    (block.severity === 'error' && DECLINED_REFUSAL.test(value))
  );
}

/** What the person declined in this call, or undefined when they did not. */
export function toolDecline(tool: ToolInvocation): ToolDecline | undefined {
  const result = toolResultRecord(tool.output);
  const recorded =
    readDecline(result?.declined) ?? readDecline(asRecord(result?.operation)?.declined);
  if (recorded) return recorded;
  const blocks = tool.presentation?.blocks ?? [];
  // A capped result still has the agent's outline of it.
  const outline = blocks.find((block) => block.id === STRUCTURED_RESULT_BLOCK)?.text;
  const outlined = outline ? readDecline(outlineValue(outline)?.declined) : undefined;
  if (outlined) return outlined;
  for (const block of blocks) {
    const value = prose(block);
    const said = DECLINED_TEXT.exec(value);
    if (said) return { question: said[1]!.trim(), notDone: said[2]?.trim() ?? '' };
    const refused = block.severity === 'error' ? DECLINED_REFUSAL.exec(value) : null;
    if (refused) return { question: refused[1]?.trim() ?? '', notDone: '' };
  }
  return undefined;
}

/** The decline as its own outcome: "You declined", what was asked, and what was not done. */
export function declineBlock(decline: ToolDecline): ToolPresentationBlock {
  return {
    id: 'declined',
    type: 'text',
    label: t`You declined`,
    text: [decline.question, decline.notDone].filter(Boolean).join('\n'),
  };
}
