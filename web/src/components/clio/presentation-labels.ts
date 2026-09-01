/** Converts wire vocabulary into restrained user-facing copy without changing its meaning. */
export function humanizeProtocolValue(value: string): string {
  const words = value
    .replace(/([a-z\d])([A-Z])/gu, '$1 $2')
    .replace(/[._-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!words) return 'Unknown';
  return words.charAt(0).toUpperCase() + words.slice(1);
}
