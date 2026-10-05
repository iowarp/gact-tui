import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** Separate endpoint users in UI caches without storing their credential in a query key. */
export function connectionScope(settings: { endpoint: string; token?: string }): string {
  return JSON.stringify([settings.endpoint, bytesToHex(sha256(utf8ToBytes(settings.token ?? '')))]);
}
