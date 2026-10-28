import type { AttentionPromptLine } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { visibleRows } from './attention-prompt-rows';

const line = (index: number, levels: number[], domain = 'system'): AttentionPromptLine => ({
  index,
  text: `line ${index}`,
  token_lo: index,
  token_hi: index + 1,
  section: 0,
  domain,
  values: levels,
  levels,
});

describe('visibleRows', () => {
  const lines = [
    line(0, [0, 0]),
    line(1, [3, 0]),
    line(2, [0, 0], 'user'),
    line(3, [0, 0], 'user'),
    line(4, [0, 9], 'user'),
    line(5, [0, 0], 'user'),
  ];

  it('keeps every line, marking where the prompt section changes', () => {
    const rows = visibleRows(lines, false);
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.kind === 'line' && row.domainChanged)).toEqual([
      true,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('collapses each run of lines without heat into one counted gap', () => {
    expect(
      visibleRows(lines, true).map((row) =>
        row.kind === 'gap' ? `gap ${row.from}+${row.count}` : `line ${row.line.index}`,
      ),
    ).toEqual(['gap 0+1', 'line 1', 'gap 2+2', 'line 4', 'gap 5+1']);
  });
});
