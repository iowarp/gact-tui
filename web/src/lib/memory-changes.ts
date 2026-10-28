import type { MemoryFactChange } from '@clio/core/v3';

interface CapturedFact {
  id: string;
  text: string;
  superseded: string;
}

/** Read canonical fact annotations for display; original source text stays untouched. */
function facts(text: string): CapturedFact[] {
  return text.split('\n').flatMap((line) => {
    const match = /^- (.*?) \{([^}]+)\}$/u.exec(line);
    if (!match) return [];
    const metadata = Object.fromEntries(
      match[2]!.split(', ').map((pair) => {
        const at = pair.indexOf('=');
        return [pair.slice(0, at), pair.slice(at + 1)];
      }),
    );
    if (!metadata.id) return [];
    const superseded = metadata.superseded_by || '';
    return [
      {
        id: metadata.id,
        text: superseded ? match[1]!.replace(/^~~|~~$/gu, '') : match[1]!,
        superseded,
      },
    ];
  });
}

/** Follow recorded fact IDs; unrelated removals/additions are never guessed to be a correction. */
export function memoryChanges(before: string, after: string): MemoryFactChange[] {
  const previous = facts(before).filter((f) => !f.superseded);
  const following = new Map(facts(after).map((f) => [f.id, f]));
  const used = new Set<string>();
  const result: MemoryFactChange[] = [];
  for (const old of previous) {
    let next = following.get(old.id);
    const visited = new Set<string>();
    while (next?.superseded && !visited.has(next.id)) {
      visited.add(next.id);
      next = following.get(next.superseded);
    }
    if (next && !next.superseded) {
      used.add(next.id);
      if (next.text !== old.text)
        result.push({ id: next.id, kind: 'updated', before: old.text, after: next.text });
    } else result.push({ id: old.id, kind: 'removed', before: old.text, after: '' });
  }
  for (const next of following.values())
    if (!next.superseded && !used.has(next.id))
      result.push({ id: next.id, kind: 'added', before: '', after: next.text });
  return result;
}

/** Keep common word boundaries in linear time; the changed span is shown explicitly. */
export function correctionParts(before: string, after: string) {
  const old = before.match(/\w+|\s+|[^\w\s]+/gu) ?? [];
  const next = after.match(/\w+|\s+|[^\w\s]+/gu) ?? [];
  let first = 0;
  while (first < old.length && first < next.length && old[first] === next[first]) first++;
  let end = 0;
  while (
    end < old.length - first &&
    end < next.length - first &&
    old[old.length - 1 - end] === next[next.length - 1 - end]
  )
    end++;
  return {
    prefix: old.slice(0, first).join(''),
    removed: old.slice(first, old.length - end).join(''),
    added: next.slice(first, next.length - end).join(''),
    suffix: end ? old.slice(-end).join('') : '',
  };
}
