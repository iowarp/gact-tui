// Unit tests for scripts/check_brand_literals.mjs's pure helpers. The script
// itself only runs as a lint step (`node scripts/check_brand_literals.mjs`),
// but its two trickiest behaviors — not mistaking a URL's `//` for a line
// comment, and not letting one allowlisted phrase excuse every 'CLIO' on the
// same line — are exactly the kind of regression that is cheap to pin down
// here and expensive to notice by eye in a lint failure.
import { describe, expect, it } from 'vitest';
import {
  allowlistSpans,
  clioOccurrences,
  lineCommentIndex,
  stripComments,
} from '../../../scripts/check_brand_literals.mjs';

describe('check_brand_literals: comment stripping', () => {
  it('does not treat the // in a URL as a line comment, so trailing CLIO text is still scanned', () => {
    const line = 'See https://example.com/docs for the CLIO integration guide.';

    expect(lineCommentIndex(line)).toBe(-1);
    expect(stripComments(line)).toBe(line);
    expect(clioOccurrences(stripComments(line))).toHaveLength(1);
  });

  it('still strips a real line comment at the start of a line or after whitespace', () => {
    expect(stripComments('// CLIO is mentioned only in this comment')).toBe('');
    expect(stripComments('const x = 1; // trailing CLIO comment')).toBe('const x = 1; ');
  });
});

describe('check_brand_literals: per-occurrence allowlist coverage', () => {
  it('fails a bare, uncovered CLIO occurrence even when another CLIO on the same line is allowlisted', () => {
    const line = 'CLIO Relay connects CLIO to the workspace.';
    const entries = [{ file: 'web/src/example.tsx', match: 'CLIO Relay', reason: 'test fixture' }];

    const occurrences = clioOccurrences(line);
    const spans = allowlistSpans(line, entries);
    const uncovered = occurrences.filter(
      (position) => !spans.some((span) => position >= span.start && position < span.end),
    );

    expect(occurrences).toHaveLength(2);
    expect(uncovered).toHaveLength(1);
  });

  it('covers every CLIO occurrence when an allowlisted phrase matches each one', () => {
    const line = 'CLIO Relay works alongside CLIO Web Search.';
    const entries = [
      { file: 'web/src/example.tsx', match: 'CLIO Relay', reason: 'test fixture' },
      { file: 'web/src/example.tsx', match: 'CLIO Web Search', reason: 'test fixture' },
    ];

    const occurrences = clioOccurrences(line);
    const spans = allowlistSpans(line, entries);
    const uncovered = occurrences.filter(
      (position) => !spans.some((span) => position >= span.start && position < span.end),
    );

    expect(occurrences).toHaveLength(2);
    expect(uncovered).toHaveLength(0);
  });
});
