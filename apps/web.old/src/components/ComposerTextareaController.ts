/**
 * Controller for Composer Textarea: imperative glue/effects wiring the component to its model.
 */
import type { Setter } from 'solid-js';
import { createCompressedPasteInsertion, expandLatestCompressedPaste } from './ComposerPaste.js';
import type { ComposerHistory } from './ComposerState.js';
import {
  shouldExitComposerHistory,
  shouldExpandCompressedPaste,
  shouldNavigateHistoryNext,
  shouldNavigateHistoryPrevious,
  shouldOpenSlashPalette,
  shouldSubmitComposer,
} from './ComposerTextareaModel.js';

export function resizeComposerTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(200, textarea.scrollHeight) + 'px';
}

function syncTextareaLater(
  textarea: HTMLTextAreaElement,
  value: string,
  options: { caret?: number; resize?: boolean } = {},
) {
  queueMicrotask(() => {
    textarea.value = value;
    if (options.caret !== undefined) {
      textarea.setSelectionRange(options.caret, options.caret);
    }
    if (options.resize) {
      resizeComposerTextarea(textarea);
    }
  });
}

export interface ComposerPasteControllerOptions {
  threshold: number;
  setText: Setter<string>;
  setPasteStash: Setter<Record<string, string>>;
}

export function handleComposerTextareaPaste(
  event: ClipboardEvent & { currentTarget: HTMLTextAreaElement },
  options: ComposerPasteControllerOptions,
): boolean {
  if (options.threshold <= 0) return false;
  const clip = event.clipboardData?.getData('text');
  if (!clip) return false;
  const lines = clip.split(/\r?\n/).length;
  if (lines < options.threshold) return false;

  event.preventDefault();
  const id = Math.random().toString(36).slice(2, 8);
  options.setPasteStash((stash) => ({ ...stash, [id]: clip }));
  const textarea = event.currentTarget;
  const insertion = createCompressedPasteInsertion({
    current: textarea.value,
    pasted: clip,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
    id,
  });
  options.setText(insertion.nextText);
  syncTextareaLater(textarea, insertion.nextText, { caret: insertion.caret, resize: true });
  return true;
}

export interface ComposerKeyDownControllerOptions {
  mentionOpen: boolean;
  setMentionHighlight: Setter<number>;
  text: string;
  onSlashTyped?: () => void;
  history: ComposerHistory;
  pasteStash: Record<string, string>;
  setText: Setter<string>;
  setPasteStash: Setter<Record<string, string>>;
  submit: () => void | Promise<void>;
}

export function handleComposerTextareaKeyDown(
  event: KeyboardEvent & { currentTarget: HTMLTextAreaElement },
  options: ComposerKeyDownControllerOptions,
): boolean {
  if (options.mentionOpen) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      options.setMentionHighlight((highlight) => highlight + 1);
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      options.setMentionHighlight((highlight) => Math.max(0, highlight - 1));
      return true;
    }
  }

  if (shouldOpenSlashPalette(event, options.text) && options.onSlashTyped) {
    event.preventDefault();
    options.onSlashTyped();
    return true;
  }

  const textarea = event.currentTarget;
  const selection = {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
    valueLength: textarea.value.length,
  };

  if (shouldNavigateHistoryPrevious(selection)) {
    const prev = options.history.previous();
    if (prev !== null) {
      event.preventDefault();
      options.setText(prev);
      syncTextareaLater(textarea, prev, { caret: prev.length });
      return true;
    }
  }

  if (shouldNavigateHistoryNext(selection)) {
    const next = options.history.next();
    if (next !== null) {
      event.preventDefault();
      options.setText(next);
      syncTextareaLater(textarea, next, { caret: next.length });
      return true;
    }
  }

  if (shouldExitComposerHistory(event)) {
    options.history.exit();
  }

  if (shouldExpandCompressedPaste(event, Object.keys(options.pasteStash).length > 0)) {
    event.preventDefault();
    const expanded = expandLatestCompressedPaste(textarea.value, options.pasteStash);
    if (!expanded) return true;
    options.setText(expanded.nextText);
    options.setPasteStash((stash) => {
      const copy = { ...stash };
      delete copy[expanded.id];
      return copy;
    });
    syncTextareaLater(textarea, expanded.nextText, { resize: true });
    return true;
  }

  if (shouldSubmitComposer(event)) {
    event.preventDefault();
    void options.submit();
    return true;
  }

  return false;
}
