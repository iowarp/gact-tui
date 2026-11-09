import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

// Read during render by most data hooks (once per transcript message for
// some), so the digest is remembered for the few connections a window uses.
const scopes = new Map<string, string>();

/** Separate endpoint users in UI caches without storing their credential in a query key. */
export function connectionScope(settings: { endpoint: string; token?: string }): string {
  const token = settings.token ?? '';
  const key = `${settings.endpoint}\n${token}`;
  let scope = scopes.get(key);
  if (scope === undefined) {
    scope = JSON.stringify([settings.endpoint, bytesToHex(sha256(utf8ToBytes(token)))]);
    if (scopes.size >= 8) scopes.clear();
    scopes.set(key, scope);
  }
  return scope;
}
