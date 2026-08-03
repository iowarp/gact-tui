import { describe, expect, it } from 'vitest';
import {
  composerSubmitDraft,
  composerSubmitErrorMessage,
} from '../../src/components/ComposerSubmitModel.js';

describe('ComposerSubmitModel', () => {
  it('blocks empty, busy, or disabled submissions', () => {
    expect(composerSubmitDraft({ text: '   ' })).toBeNull();
    expect(composerSubmitDraft({ text: 'hello', busy: true })).toBeNull();
    expect(composerSubmitDraft({ text: 'hello', disabled: true })).toBeNull();
  });

  it('trims text for history and expands compressed paste placeholders for send', () => {
    const draft = composerSubmitDraft({
      text: '  before [pasted 2 lines · click to expand · #abc123] after  ',
      pasteStash: { abc123: 'one\ntwo' },
    });

    expect(draft).toEqual({
      trimmedText: 'before [pasted 2 lines · click to expand · #abc123] after',
      expandedText: 'before one\ntwo after',
    });
  });

  it('uses the error message when available and stringifies unknown failures', () => {
    expect(composerSubmitErrorMessage(new Error('network down'))).toBe(
      'network down',
    );
    expect(composerSubmitErrorMessage('plain failure')).toBe('plain failure');
  });
});
