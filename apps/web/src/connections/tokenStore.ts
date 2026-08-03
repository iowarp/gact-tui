import { inTauri } from '../tauri/tauri';
import { invoke } from '../tauri/tauriApi';

/**
 * Bearer-token storage.
 *
 * The legacy app kept bearer tokens in localStorage (gact-tui#263). That is
 * readable by any script on the origin and survives the session, so this build
 * does not do it — in either environment:
 *
 *   desktop (Tauri) — delegated to the shell's OS-backed secure store.
 *   browser         — held IN MEMORY ONLY, for the life of the page.
 *
 * The browser case is a deliberate capability difference, not an oversight:
 * there is no browser storage that is both persistent and safe for a bearer
 * token, so the honest behaviour is to make the user re-enter it and to SAY
 * that is why. `persistence()` reports which mode is in effect so the UI can
 * tell the user rather than silently forgetting their token.
 */

export type TokenPersistence = 'os-keychain' | 'memory-only';

const memory = new Map<string, string>();

/** Which persistence mode is in effect for this environment. */
export function persistence(): TokenPersistence {
  return inTauri() ? 'os-keychain' : 'memory-only';
}

/** Human-readable explanation of the current mode, for the connection UI. */
export function persistenceNote(): string {
  return persistence() === 'os-keychain'
    ? 'Tokens are stored in your operating system keychain.'
    : 'Tokens are kept for this tab only. Browsers have no storage that is both persistent and safe for a bearer token, so you will re-enter it next time.';
}

export async function saveToken(connectionId: string, token: string): Promise<void> {
  if (!inTauri()) {
    memory.set(connectionId, token);
    return;
  }
  try {
    await invoke('store_bearer_token', { connectionId, token });
  } catch (err) {
    // Do NOT fall back to a weaker store. Downgrading from the keychain to
    // localStorage without saying so is precisely the silent degradation this
    // module exists to prevent; keep it in memory and surface the failure.
    memory.set(connectionId, token);
    throw new Error(
      `Could not write the token to the OS keychain, so it is held for this session only: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export async function loadToken(connectionId: string): Promise<string | undefined> {
  if (!inTauri()) return memory.get(connectionId);
  try {
    const token = await invoke<string | null>('load_bearer_token', { connectionId });
    return token ?? memory.get(connectionId);
  } catch {
    return memory.get(connectionId);
  }
}

export async function clearToken(connectionId: string): Promise<void> {
  memory.delete(connectionId);
  if (!inTauri()) return;
  try {
    await invoke('clear_bearer_token', { connectionId });
  } catch {
    // Already absent, or the shell has no such command — the in-memory copy is
    // gone either way, which is what the caller asked for.
  }
}

/** Test seam: drop every in-memory token. */
export function resetMemoryTokens(): void {
  memory.clear();
}
