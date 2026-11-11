/**
 * A query's `structuralSharing` for file bytes: a refetch that returns the same bytes
 * keeps the cached array, so a viewer holding it (a PDF, an image) doesn't reload when
 * another surface opens the same file.
 */
export function keepEqualBytes(previous: unknown, next: unknown): unknown {
  if (
    !(previous instanceof Uint8Array) ||
    !(next instanceof Uint8Array) ||
    previous.byteLength !== next.byteLength
  )
    return next;
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) return next;
  }
  return previous;
}
