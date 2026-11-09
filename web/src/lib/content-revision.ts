import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Rendered text binds to the SHA-256 of its source, and a virtualized
// transcript remounts the same blocks on every scroll and conversation switch.
// The strings are already held by the store, so remembering their digests
// costs one map entry each; the bounds keep a closed conversation from staying
// reachable through this cache for long.
const MAX_ENTRIES = 4096;
const MAX_CHARACTERS = 8_000_000;
const revisions = new Map<string, string>();
let characters = 0;

/** Hex SHA-256 of the UTF-8 text: the `content_revision` of a transcript part. */
export function contentRevision(text: string): string {
  const known = revisions.get(text);
  if (known !== undefined) {
    // Most recently used last, so eviction drops the coldest entry first.
    revisions.delete(text);
    revisions.set(text, known);
    return known;
  }
  const revision = bytesToHex(sha256(new TextEncoder().encode(text)));
  if (text.length <= MAX_CHARACTERS) {
    revisions.set(text, revision);
    characters += text.length;
    for (const oldest of revisions.keys()) {
      if (revisions.size <= MAX_ENTRIES && characters <= MAX_CHARACTERS) break;
      revisions.delete(oldest);
      characters -= oldest.length;
    }
  }
  return revision;
}
