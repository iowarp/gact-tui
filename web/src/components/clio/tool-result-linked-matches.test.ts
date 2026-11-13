import { describe, expect, it } from 'vitest';
import type { ToolPresentationBlock } from '@clio/core/v3';
import { linkedMatchRuns } from './tool-result-linked-matches';

const link = (id: string, uri = `https://example.org/${id}`): ToolPresentationBlock => ({
  id,
  type: 'link',
  target: 'url',
  uri,
  label: `Title ${id}`,
});
const line = (id: string, text: string): ToolPresentationBlock => ({ id, type: 'text', text });

describe('linked match runs', () => {
  it('pairs each web link with the plain line after it and leaves notes and files alone', () => {
    const blocks: ToolPresentationBlock[] = [
      line('subject', 'station drift'),
      { id: 'note', type: 'text', severity: 'warning', text: 'Moved to Exa.' },
      link('a'),
      line('a-snippet', '2026-01-02 Velocities.'),
      link('b'),
      link('c'),
      line('c-cite', 'Rivera et al., 2024'),
      { id: 'payload', type: 'link', target: 'resource', uri: '/w/answer.json', label: 'Full' },
    ];
    expect(linkedMatchRuns(blocks)).toEqual([
      {
        start: 2,
        end: 7,
        rows: [
          { title: 'Title a', url: 'https://example.org/a', snippet: '2026-01-02 Velocities.' },
          { title: 'Title b', url: 'https://example.org/b' },
          { title: 'Title c', url: 'https://example.org/c', snippet: 'Rivera et al., 2024' },
        ],
      },
    ]);
  });

  it('keeps a single link as it is and splits runs at a heading', () => {
    expect(linkedMatchRuns([link('only'), line('only-snippet', 'Text')])).toEqual([]);
    const runs = linkedMatchRuns([
      line('references-heading', 'References (2)'),
      link('r0'),
      link('r1'),
      { id: 'cited-heading', type: 'text', label: 'Cited by', text: 'Cited by (2)' },
      link('c0'),
      link('c1'),
    ]);
    expect(runs.map((run) => [run.start, run.end, run.rows.length])).toEqual([
      [1, 3, 2],
      [4, 6, 2],
    ]);
  });
});
