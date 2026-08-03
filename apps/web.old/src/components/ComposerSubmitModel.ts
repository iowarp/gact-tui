/**
 * View-model / pure logic for Composer Submit: state shaping and helpers, no DOM. Key export `ComposerSubmitState`.
 */
import { expandCompressedPastes } from './ComposerPaste.js';

export interface ComposerSubmitState {
  text: string;
  busy?: boolean;
  disabled?: boolean;
  pasteStash?: Record<string, string>;
}

export interface ComposerSubmitDraft {
  trimmedText: string;
  expandedText: string;
}

export function composerSubmitDraft(
  state: ComposerSubmitState,
): ComposerSubmitDraft | null {
  const trimmedText = state.text.trim();
  if (!trimmedText || state.busy || state.disabled) return null;
  return {
    trimmedText,
    expandedText: expandCompressedPastes(trimmedText, state.pasteStash ?? {}),
  };
}

export function composerSubmitErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
