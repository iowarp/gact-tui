/**
 * Up to two initials from a name: the first and last words ("Jaime Cernuda" → "JC",
 * "Fixture Sign-in" → "FS"); a single word splits on hyphens and underscores
 * ("fixture-address" → "FA").
 */
export function monogramInitials(name: string): string {
  const spaced = name.split(/\s+/u).filter(Boolean);
  const words = spaced.length > 1 ? spaced : name.split(/[\s_-]+/u).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters
    .map((word) => Array.from(word ?? '')[0] ?? '')
    .join('')
    .toUpperCase();
}
