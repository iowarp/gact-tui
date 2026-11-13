/** Up to two initials from a name, e.g. "Jaime Cernuda" → "JC", "fixture-address" → "FA". */
export function monogramInitials(name: string): string {
  const words = name.split(/[\s_-]+/u).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters
    .map((word) => Array.from(word ?? '')[0] ?? '')
    .join('')
    .toUpperCase();
}
