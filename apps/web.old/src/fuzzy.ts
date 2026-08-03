/** Subsequence fuzzy matching shared by the command palette + the
 * @-mention / slash-command pickers. */

/** Returns -1 if `q` is not a subsequence of `text`; otherwise a score that
 * rewards contiguous runs and word-boundary hits (so "gs" ranks
 * "go · settings" above "tags"). `q` must already be lower-cased. */
export function fuzzyScore(text: string, q: string): number {
  if (!q) return 0;
  const t = text.toLowerCase();
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2;
    if (found === 0 || /[\s\-_/.]/.test(t[found - 1] ?? '')) score += 3;
    ti = found + 1;
  }
  return score - t.length * 0.01; // tie-break toward tighter matches
}

/**
 * Rank `items` against query `q` (already lower-cased) by fuzzy-matching each
 * item's primary + secondary text. A primary-field match ALWAYS outranks a
 * secondary-only match, so a sparse query surfaces label/trigger hits above
 * description hits. Items matching neither are dropped.
 */
export function fuzzyRank<T>(
  items: readonly T[],
  q: string,
  primary: (item: T) => string,
  secondary?: (item: T) => string,
): T[] {
  if (!q) return [...items];
  return items
    .map((item) => {
      const p = fuzzyScore(primary(item), q);
      const s = secondary ? fuzzyScore(secondary(item), q) : -1;
      const score = p >= 0 ? p + 1000 : s;
      return { item, score };
    })
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}
