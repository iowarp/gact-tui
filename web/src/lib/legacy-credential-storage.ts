/**
 * `localStorage` keys that earlier frontends wrote bearer tokens under.
 *
 * The Solid frontend (May to August 2026) kept its backend registry, tokens
 * included, in `clio.backends.v1` (`LocalStoragePersistence`). The current app
 * never reads that key, so an installed app upgraded from one of those releases
 * would keep the tokens on disk indefinitely (gact-tui#263). Tokens now live in
 * the operating system's credential store on desktop, and only in memory in a
 * browser (docs/security.md).
 */
export const LEGACY_TOKEN_STORAGE_KEYS: readonly string[] = ['clio.backends.v1'];

/** Remove the legacy token stores. Runs on every start; a no-op once they are gone. */
export function removeLegacyCredentialStorage(storage: Pick<Storage, 'removeItem'>): void {
  for (const key of LEGACY_TOKEN_STORAGE_KEYS) storage.removeItem(key);
}
