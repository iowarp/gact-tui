/**
 * View-model / pure logic for Composer Textarea: state shaping and helpers, no DOM. Key export `ComposerKeyboardState`.
 */
export interface ComposerKeyboardState {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export interface ComposerSelectionState extends ComposerKeyboardState {
  selectionStart: number;
  selectionEnd: number;
  valueLength: number;
}

const HISTORY_EXIT_IGNORED_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'Shift',
  'Control',
  'Meta',
  'Alt',
]);

export function mentionQueryForText(text: string): string | null {
  const at = text.lastIndexOf('@');
  if (at === -1) return null;
  const tail = text.slice(at + 1);
  if (/\s/.test(tail)) return null;
  return tail;
}

export function textWithPickedMention(text: string, label: string): string {
  const at = text.lastIndexOf('@');
  return (at === -1 ? text : text.slice(0, at)) + '@' + label + ' ';
}

export function shouldOpenSlashPalette(input: ComposerKeyboardState, text: string): boolean {
  return input.key === '/' && text.length === 0;
}

export function shouldNavigateHistoryPrevious(input: ComposerSelectionState): boolean {
  return (
    input.key === 'ArrowUp' &&
    !input.ctrlKey &&
    !input.metaKey &&
    !input.altKey &&
    input.selectionStart === 0 &&
    input.selectionEnd === 0
  );
}

export function shouldNavigateHistoryNext(input: ComposerSelectionState): boolean {
  return (
    input.key === 'ArrowDown' &&
    !input.ctrlKey &&
    !input.metaKey &&
    !input.altKey &&
    input.selectionStart === input.valueLength &&
    input.selectionEnd === input.valueLength
  );
}

export function shouldExitComposerHistory(input: ComposerKeyboardState): boolean {
  return !HISTORY_EXIT_IGNORED_KEYS.has(input.key);
}

export function shouldExpandCompressedPaste(
  input: ComposerKeyboardState,
  hasCompressedPaste: boolean,
): boolean {
  return (
    (input.metaKey || input.ctrlKey) === true &&
    input.key.toLowerCase() === 'p' &&
    !input.shiftKey &&
    hasCompressedPaste
  );
}

export function shouldSubmitComposer(input: ComposerKeyboardState): boolean {
  return (
    (input.key === 'Enter' && (input.metaKey || input.ctrlKey)) ||
    (input.key === 'Enter' && !input.shiftKey)
  );
}
