/**
 * View-model / pure logic for Prompt Card: state shaping and helpers, no DOM. Key export `PromptActionResult`.
 */
import type { PromptDef } from '@clio/core';
import { promptHasValidationErrors } from './PromptCardSummary.js';

export interface PromptActionResult {
  ok: boolean;
  msg: string;
}

export function promptCardClass(prompt: PromptDef, open: boolean): string {
  return (
    'dp__card prompts__card ' +
    (promptHasValidationErrors(prompt) ? 'dp__card--err ' : '') +
    (open ? 'dp__card--open' : '')
  );
}

export function promptPreviewText(response: { prompt?: { text?: string | null } }): string {
  return response.prompt?.text ?? '';
}

export function promptValidationResult(errors: string[] | undefined): PromptActionResult {
  const validationErrors = errors ?? [];
  return validationErrors.length === 0
    ? { ok: true, msg: 'Prompt text is valid.' }
    : { ok: false, msg: validationErrors.join('; ') };
}

export function promptSaveResult(scope: string): PromptActionResult {
  return { ok: true, msg: `Saved (${scope}).` };
}

export function promptErrorResult(error: unknown): PromptActionResult {
  return {
    ok: false,
    msg: error instanceof Error ? error.message : String(error),
  };
}
