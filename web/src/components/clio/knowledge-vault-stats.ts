import type { KnowledgeSnapshot } from '@clio/core/v3';

/** "1 link", "8 links": the count of notes linked to or from a note. */
export function knowledgeLinkCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'link' : 'links'}`;
}

/** Resolved links per note path, each linked pair counted once. */
export function knowledgeDegrees(snapshot: Pick<KnowledgeSnapshot, 'links'>) {
  const pairs = new Set<string>();
  const degrees = new Map<string, number>();
  for (const link of snapshot.links) {
    if (link.status !== 'resolved' || link.source === link.target) continue;
    const pair = [link.source, link.target].sort().join('\n');
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1);
    degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1);
  }
  return { degrees, links: pairs.size };
}
