import { describe, expect, it } from 'vitest';
import { sanitizeEmphasis } from '../../src/components/sanitizeEmphasis.js';

/**
 * smd lacks CommonMark flanking rules, so stray `*`/`_` cascade into runaway
 * emphasis. sanitizeEmphasis backslash-escapes the stray delimiters while keeping
 * real emphasis, bullets, and code spans intact.
 */
describe('sanitizeEmphasis', () => {
  // --- underscores ---
  it('escapes intraword underscores (text_text, time_s, shell_bash)', () => {
    expect(sanitizeEmphasis('run shell_bash on time_s and text_text')).toBe(
      'run shell\\_bash on time\\_s and text\\_text',
    );
  });

  it('keeps real underscore emphasis (__bold__, _em_)', () => {
    expect(sanitizeEmphasis('a __bold__ and _em_ word')).toBe('a __bold__ and _em_ word');
  });

  // --- asterisks: the cases you named ---
  it('escapes a stray closing-comment */', () => {
    expect(sanitizeEmphasis('end of block */ then more')).toBe('end of block \\*/ then more');
  });

  it('escapes a stray opening-comment /*', () => {
    expect(sanitizeEmphasis('/* comment starts here')).toBe('/\\* comment starts here');
  });

  it('escapes a glob *.py', () => {
    expect(sanitizeEmphasis('match *.py files')).toBe('match \\*.py files');
  });

  it('escapes a lone * that would cascade (2*3)', () => {
    expect(sanitizeEmphasis('compute 2*3 now')).toBe('compute 2\\*3 now');
  });

  // --- asterisks: must NOT break real markdown ---
  it('keeps **bold** and *italic*', () => {
    expect(sanitizeEmphasis('this is **bold** and *italic* text')).toBe(
      'this is **bold** and *italic* text',
    );
  });

  it('leaves a bullet-list marker alone', () => {
    expect(sanitizeEmphasis('* first\n* second')).toBe('* first\n* second');
  });

  it('leaves whitespace-flanked * alone (a * b)', () => {
    expect(sanitizeEmphasis('a * b')).toBe('a * b');
  });

  // --- code spans are untouched ---
  it('does not escape inside inline code', () => {
    expect(sanitizeEmphasis('use `shell_bash` and `*/`')).toBe('use `shell_bash` and `*/`');
  });

  it('does not escape inside a fenced block', () => {
    const src = 'text_here\n```\nx = a_b */ *.c\n```\nmore_text';
    expect(sanitizeEmphasis(src)).toBe('text\\_here\n```\nx = a_b */ *.c\n```\nmore\\_text');
  });

  // --- isolated C-style comment: both delimiters escaped ---
  it('escapes an isolated C-style comment /* ... */', () => {
    expect(sanitizeEmphasis('run /* note */ here')).toBe('run /\\* note \\*/ here');
  });

  // --- must NOT break emphasis that ends right before punctuation ---
  it('keeps *italic* that ends before a period', () => {
    expect(sanitizeEmphasis('this is *italic*. done')).toBe('this is *italic*. done');
  });

  it('keeps (*italic*) wrapped in parentheses', () => {
    expect(sanitizeEmphasis('note (*italic*) here')).toBe('note (*italic*) here');
  });

  // --- code digraphs never pair, even when two strays sit on one line ---
  it('force-escapes *. and /* so they cannot coincidentally pair into italic', () => {
    expect(sanitizeEmphasis('to *.log, see /* end')).toBe('to \\*.log, see /\\* end');
  });

  it('force-escapes a file glob path src/*.ts', () => {
    expect(sanitizeEmphasis('open src/*.ts now')).toBe('open src/\\*.ts now');
  });

  it('does NOT force-escape **bold** before a period', () => {
    expect(sanitizeEmphasis('this is **bold**. ok')).toBe('this is **bold**. ok');
  });
});
