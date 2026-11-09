import type { KnowledgeSnapshot } from '@clio/core/v3';
import { knowledgeDegrees } from './knowledge-vault-stats';

/** A note card, in graph units: it zooms with the canvas. */
export const KNOWLEDGE_NODE = { width: 120, height: 40 } as const;
/** The spec's notes per side; the rest are counted in one card. */
export const KNOWLEDGE_SIDE_LIMIT = 3;
/** Row pitch: a card plus the spec's 60px gap. */
export const KNOWLEDGE_ROW = KNOWLEDGE_NODE.height + 60;
const ROW = KNOWLEDGE_ROW;

export interface KnowledgeGraphFit {
  /** Rows that fit the pane's height, the counted rest included. */
  rows?: number;
  /** Gap between the three columns. */
  gap?: number;
}

export type KnowledgeGraphSide = 'in' | 'focus' | 'out';

export interface KnowledgeGraphCard {
  id: string;
  title: string;
  links: number;
  side: KnowledgeGraphSide;
  x: number;
  y: number;
}

export interface KnowledgeGraphMore {
  side: Exclude<KnowledgeGraphSide, 'focus'>;
  count: number;
  x: number;
  y: number;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface KnowledgeNeighborhood {
  focus?: string;
  cards: KnowledgeGraphCard[];
  more: KnowledgeGraphMore[];
  edges: KnowledgeGraphEdge[];
}

/**
 * The focused note with the notes that link to it on its left and the notes it
 * links to on its right. A note linked both ways sits on the right. The focus is
 * the selected note, else the most-linked one.
 */
export function knowledgeNeighborhood(
  snapshot: Pick<KnowledgeSnapshot, 'notes' | 'links'>,
  selected: string,
  { rows = KNOWLEDGE_SIDE_LIMIT + 1, gap = 56 }: KnowledgeGraphFit = {},
): KnowledgeNeighborhood {
  const COLUMN = KNOWLEDGE_NODE.width + gap;
  const notes = new Map(snapshot.notes.map((note) => [note.path, note]));
  const { degrees } = knowledgeDegrees(snapshot);
  const linksOf = (path: string) => degrees.get(path) ?? 0;
  const title = (path: string) => notes.get(path)?.title || path.split('/').at(-1) || path;
  const weight = (a: string, b: string) =>
    linksOf(b) - linksOf(a) || title(a).localeCompare(title(b));
  const focus = notes.has(selected) ? selected : [...notes.keys()].sort(weight)[0];
  if (!focus) return { cards: [], more: [], edges: [] };
  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  for (const link of snapshot.links) {
    if (link.status !== 'resolved' || link.source === link.target) continue;
    if (!notes.has(link.source) || !notes.has(link.target)) continue;
    if (link.target === focus) incoming.add(link.source);
    if (link.source === focus) outgoing.add(link.target);
  }
  for (const path of outgoing) incoming.delete(path);
  const cards: KnowledgeGraphCard[] = [];
  const more: KnowledgeGraphMore[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  const fits = Math.max(1, rows);
  const plan = (paths: ReadonlySet<string>) => {
    const sorted = [...paths].sort(weight);
    const limit = Math.min(KNOWLEDGE_SIDE_LIMIT, fits);
    const shown = sorted.slice(
      0,
      sorted.length > limit ? Math.max(1, Math.min(limit, fits - 1)) : limit,
    );
    return { shown, hidden: sorted.length - shown.length };
  };
  const sides = { in: plan(incoming), out: plan(outgoing) };
  const count = (side: 'in' | 'out') => sides[side].shown.length + (sides[side].hidden ? 1 : 0);
  // Top-anchored: the tallest column starts at 0 and the others centre on it.
  const tallest = Math.max(1, count('in'), count('out'));
  const middle = ((tallest - 1) * ROW) / 2;
  const column = (side: 'in' | 'out') => {
    const { shown, hidden } = sides[side];
    const rowsHere = count(side);
    const x = side === 'in' ? 0 : COLUMN * 2;
    const y = (index: number) => middle + (index - (rowsHere - 1) / 2) * ROW;
    shown.forEach((path, index) => {
      cards.push({ id: path, title: title(path), links: linksOf(path), side, x, y: y(index) });
      edges.push(
        side === 'in'
          ? { id: `${path}->${focus}`, source: path, target: focus }
          : { id: `${focus}->${path}`, source: focus, target: path },
      );
    });
    if (hidden) more.push({ side, count: hidden, x, y: y(shown.length) });
  };
  cards.push({
    id: focus,
    title: title(focus),
    links: linksOf(focus),
    side: 'focus',
    x: COLUMN,
    y: middle,
  });
  column('in');
  column('out');
  return { focus, cards, more, edges };
}
