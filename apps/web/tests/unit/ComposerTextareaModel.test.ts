import { describe, expect, it } from 'vitest';
import {
  mentionQueryForText,
  shouldExitComposerHistory,
  shouldExpandCompressedPaste,
  shouldNavigateHistoryNext,
  shouldNavigateHistoryPrevious,
  shouldOpenSlashPalette,
  shouldSubmitComposer,
  textWithPickedMention,
} from '../../src/components/ComposerTextareaModel.js';

describe('ComposerTextareaModel', () => {
  it('parses active @ mention queries', () => {
    expect(mentionQueryForText('ask @fi')).toBe('fi');
    expect(mentionQueryForText('ask @file now')).toBeNull();
    expect(mentionQueryForText('ask without mention')).toBeNull();
  });

  it('replaces the active mention tail when picking an item', () => {
    expect(textWithPickedMention('open @rea', 'README.md')).toBe('open @README.md ');
    expect(textWithPickedMention('hello', 'README.md')).toBe('hello@README.md ');
  });

  it('opens the slash palette only for slash on an empty draft', () => {
    expect(shouldOpenSlashPalette({ key: '/' }, '')).toBe(true);
    expect(shouldOpenSlashPalette({ key: '/' }, 'already typing')).toBe(false);
    expect(shouldOpenSlashPalette({ key: 'a' }, '')).toBe(false);
  });

  it('navigates history only from textarea boundaries without modifiers', () => {
    expect(
      shouldNavigateHistoryPrevious({
        key: 'ArrowUp',
        selectionStart: 0,
        selectionEnd: 0,
        valueLength: 10,
      }),
    ).toBe(true);
    expect(
      shouldNavigateHistoryPrevious({
        key: 'ArrowUp',
        selectionStart: 1,
        selectionEnd: 1,
        valueLength: 10,
      }),
    ).toBe(false);
    expect(
      shouldNavigateHistoryNext({
        key: 'ArrowDown',
        selectionStart: 10,
        selectionEnd: 10,
        valueLength: 10,
      }),
    ).toBe(true);
    expect(
      shouldNavigateHistoryNext({
        key: 'ArrowDown',
        ctrlKey: true,
        selectionStart: 10,
        selectionEnd: 10,
        valueLength: 10,
      }),
    ).toBe(false);
  });

  it('decides when normal keypresses exit history traversal', () => {
    expect(shouldExitComposerHistory({ key: 'a' })).toBe(true);
    expect(shouldExitComposerHistory({ key: 'ArrowUp' })).toBe(false);
    expect(shouldExitComposerHistory({ key: 'Shift' })).toBe(false);
  });

  it('detects compressed paste expansion shortcuts', () => {
    expect(shouldExpandCompressedPaste({ key: 'p', ctrlKey: true }, true)).toBe(true);
    expect(shouldExpandCompressedPaste({ key: 'p', metaKey: true }, false)).toBe(false);
    expect(shouldExpandCompressedPaste({ key: 'p', ctrlKey: true, shiftKey: true }, true)).toBe(
      false,
    );
  });

  it('detects submit shortcuts while preserving Shift+Enter newline behavior', () => {
    expect(shouldSubmitComposer({ key: 'Enter' })).toBe(true);
    expect(shouldSubmitComposer({ key: 'Enter', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(shouldSubmitComposer({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(shouldSubmitComposer({ key: 'a' })).toBe(false);
  });
});
