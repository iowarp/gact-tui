import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_SIDE_LIMIT, knowledgeNeighborhood } from './knowledge-graph-model';

const note = (path: string) => ({ path, title: path.replace('.md', '') }) as never;
const link = (source: string, target: string, status = 'resolved') =>
  ({ source, target, status }) as never;

describe('knowledgeNeighborhood', () => {
  it('puts the notes linking to the focus on its left and those it links to on its right', () => {
    const graph = knowledgeNeighborhood(
      {
        notes: ['hub.md', 'a.md', 'b.md', 'c.md', 'far.md'].map(note),
        links: [
          link('a.md', 'hub.md'),
          link('hub.md', 'b.md'),
          link('hub.md', 'c.md'),
          link('c.md', 'hub.md'),
          link('far.md', 'a.md'),
          link('hub.md', 'missing.md', 'unresolved'),
        ],
      },
      'hub.md',
    );
    const side = Object.fromEntries(graph.cards.map((card) => [card.id, card.side]));
    expect(side).toEqual({ 'hub.md': 'focus', 'a.md': 'in', 'b.md': 'out', 'c.md': 'out' });
    expect(graph.cards.find((card) => card.id === 'hub.md')?.links).toBe(3);
    expect(graph.edges.map((edge) => edge.id).sort()).toEqual([
      'a.md->hub.md',
      'hub.md->b.md',
      'hub.md->c.md',
    ]);
    const x = (id: string) => graph.cards.find((card) => card.id === id)!.x;
    expect(x('a.md')).toBeLessThan(x('hub.md'));
    expect(x('hub.md')).toBeLessThan(x('b.md'));
  });

  it('focuses the most-linked note when none is selected and counts the notes past the limit', () => {
    const many = Array.from({ length: KNOWLEDGE_SIDE_LIMIT + 3 }, (_, index) => `n${index}.md`);
    const graph = knowledgeNeighborhood(
      {
        notes: ['hub.md', 'lone.md', ...many].map(note),
        links: many.map((path) => link('hub.md', path)),
      },
      '',
    );
    expect(graph.focus).toBe('hub.md');
    expect(graph.cards.filter((card) => card.side === 'out')).toHaveLength(KNOWLEDGE_SIDE_LIMIT);
    expect(graph.more).toEqual([expect.objectContaining({ side: 'out', count: 3 })]);
    const short = knowledgeNeighborhood(
      { notes: ['hub.md', ...many].map(note), links: many.map((path) => link('hub.md', path)) },
      'hub.md',
      { rows: 2 },
    );
    expect(short.cards.filter((card) => card.side === 'out')).toHaveLength(1);
    expect(short.more).toEqual([expect.objectContaining({ side: 'out', count: 5 })]);
    expect(short.more[0]!.x).toBe(short.cards.find((card) => card.side === 'out')!.x);
  });
});
