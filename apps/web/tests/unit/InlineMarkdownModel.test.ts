import { describe, expect, it } from 'vitest';
import {
  normalizeCompactMarkdown,
  splitBlocks,
  tokenizeInline,
} from '../../src/components/InlineMarkdownModel.js';

describe('InlineMarkdownModel', () => {
  it('repairs compact pipe tables before block parsing', () => {
    const normalized = normalizeCompactMarkdown(
      'Ranked stations | Rank | Station | Distance km | | ---: | --- | ---: | | 1 | MTA1 | 0.37 | | 2 | PKRD | 2.37 |',
    );

    expect(normalized).toContain('\n| ---: | --- | ---: |');
    expect(splitBlocks(normalized)).toEqual([
      {
        kind: 'table',
        header: ['Ranked stations', 'Rank', 'Station', 'Distance km'],
        rows: [
          ['1', 'MTA1', '0.37'],
          ['2', 'PKRD', '2.37'],
        ],
      },
    ]);
  });

  it('keeps prose with stray pipes as text', () => {
    expect(splitBlocks('Use A | B when comparing values.')).toEqual([
      { kind: 'text', body: 'Use A | B when comparing values.' },
    ]);
  });

  it('tokenizes inline formatting without treating identifiers as emphasis', () => {
    expect(tokenizeInline('time_s **bold** *italic* `code`')).toEqual([
      { kind: 'plain', text: 'time_s ' },
      { kind: 'bold', text: 'bold' },
      { kind: 'plain', text: ' ' },
      { kind: 'italic', text: 'italic' },
      { kind: 'plain', text: ' ' },
      { kind: 'code', text: 'code' },
    ]);
  });

  it('strips trailing punctuation from autolinks', () => {
    expect(tokenizeInline('see https://example.com/path.')).toEqual([
      { kind: 'plain', text: 'see ' },
      { kind: 'link', text: 'https://example.com/path', href: 'https://example.com/path' },
      { kind: 'plain', text: '.' },
    ]);
  });
});
