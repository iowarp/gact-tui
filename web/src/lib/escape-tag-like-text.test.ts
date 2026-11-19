import { describe, expect, it } from 'vitest';
import { escapeTagLikeText } from './escape-tag-like-text';

describe('escapeTagLikeText', () => {
  it('escapes a tag-like placeholder so the renderer keeps it', () => {
    expect(escapeTagLikeText('ANSWER: <dose>; <AGREES or DISAGREES>')).toBe(
      'ANSWER: \\<dose>; \\<AGREES or DISAGREES>',
    );
    expect(escapeTagLikeText('</x> <!-- c --> <?p?>')).toBe('\\</x> \\<!-- c --> \\<?p?>');
  });

  it('leaves a comparison and text without "<" untouched', () => {
    expect(escapeTagLikeText('a < b and 3 <5')).toBe('a < b and 3 <5');
    const plain = 'nothing to do here';
    expect(escapeTagLikeText(plain)).toBe(plain);
  });

  it('leaves code alone: inline spans, fences and indented blocks', () => {
    expect(escapeTagLikeText('use `<div>` for <tag>')).toBe('use `<div>` for \\<tag>');
    const fenced = 'before <a>\n```html\n<div>\n```\nafter <b>';
    expect(escapeTagLikeText(fenced)).toBe('before \\<a>\n```html\n<div>\n```\nafter \\<b>');
    const indented = 'para\n\n    <code>\n\nmore <x>';
    expect(escapeTagLikeText(indented)).toBe('para\n\n    <code>\n\nmore \\<x>');
  });

  it('escapes in an indented line that continues a paragraph or a ">>>" quote', () => {
    expect(escapeTagLikeText('>>> call()\n    value <unit>')).toBe(
      '>>> call()\n    value \\<unit>',
    );
  });
});
