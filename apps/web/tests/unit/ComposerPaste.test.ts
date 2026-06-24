import { describe, expect, it } from 'vitest';
import {
  createCompressedPasteInsertion,
  expandCompressedPastes,
  expandLatestCompressedPaste,
} from '../../src/components/ComposerPaste.js';

describe('Composer paste helpers', () => {
  it('creates the same compressed placeholder used by the composer', () => {
    const inserted = createCompressedPasteInsertion({
      current: 'before after',
      pasted: 'a\nb\nc',
      selectionStart: 7,
      selectionEnd: 7,
      id: 'abc123',
    });

    expect(inserted.placeholder).toBe('[pasted 3 lines · click to expand · #abc123]');
    expect(inserted.nextText).toBe('before [pasted 3 lines · click to expand · #abc123]after');
    expect(inserted.caret).toBe('before [pasted 3 lines · click to expand · #abc123]'.length);
  });

  it('expands all compressed paste placeholders on submit', () => {
    const text =
      'x [pasted 2 lines · click to expand · #one111] y [pasted 3 lines · click to expand · #two222]';

    expect(
      expandCompressedPastes(text, {
        one111: 'a\nb',
        two222: 'c\nd\ne',
      }),
    ).toBe('x a\nb y c\nd\ne');
  });

  it('expands only the latest placeholder for Ctrl/Cmd+P', () => {
    const text =
      '[pasted 2 lines · click to expand · #one111] and [pasted 3 lines · click to expand · #two222]';

    expect(
      expandLatestCompressedPaste(text, {
        one111: 'a\nb',
        two222: 'c\nd\ne',
      }),
    ).toEqual({
      id: 'two222',
      nextText: '[pasted 2 lines · click to expand · #one111] and c\nd\ne',
    });
  });
});
