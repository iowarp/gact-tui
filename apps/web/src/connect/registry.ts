import { EMPTY_REGISTRY, type BackendEntry, type BackendRegistryState } from '@clio/core';

/**
 * Saved connections.
 *
 * The registry TYPE is the kept `@clio/core` backend store — this adds only
 * persistence and a last-used marker. Retyping a backend URL every session was
 * a regression against the legacy UI, which remembered them.
 *
 * The entry is keyed by URL rather than a generated id: two entries for the
 * same address are the same backend, and a user who re-adds one expects to
 * update it, not to accumulate duplicates.
 */

const STORAGE_KEY = 'clio.backends.v3';

export interface RememberInput {
  url: string;
  label: string;
  /** Accepted for convenience and deliberately NOT persisted. */
  bearerToken?: string;
}

export function loadRegistry(): BackendRegistryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_REGISTRY, backends: [] };
    const parsed = JSON.parse(raw) as BackendRegistryState;
    return {
      backends: Array.isArray(parsed.backends) ? parsed.backends : [],
      currentId: parsed.currentId ?? null,
    };
  } catch {
    // Corrupt storage must not stop the app booting — the user can always
    // re-add a backend, but they cannot fix a white screen.
    return { ...EMPTY_REGISTRY, backends: [] };
  }
}

export function saveRegistry(state: BackendRegistryState): void {
  try {
    // Tokens live in the token store (OS keychain / memory). Stripping here
    // means a stray write can never leak one into localStorage.
    const safe: BackendRegistryState = {
      ...state,
      backends: state.backends.map((b) => ({ ...b, bearerToken: '' })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Storage unavailable (private mode, quota). The session still works.
  }
}

export function rememberBackend(
  state: BackendRegistryState,
  input: RememberInput,
): BackendRegistryState {
  const existing = state.backends.find((b) => b.url === input.url);
  if (existing) {
    return {
      ...state,
      backends: state.backends.map((b) =>
        b.url === input.url ? { ...b, label: input.label || b.label } : b,
      ),
    };
  }
  const entry: BackendEntry = {
    id: input.url,
    label: input.label || input.url,
    url: input.url,
    bearerToken: '',
    kind: 'http',
  };
  return { ...state, backends: [...state.backends, entry] };
}

export function forgetBackend(state: BackendRegistryState, url: string): BackendRegistryState {
  return {
    backends: state.backends.filter((b) => b.url !== url),
    // A dangling currentId would make the next launch autoconnect to a backend
    // that is no longer listed.
    currentId: state.currentId === url ? null : state.currentId,
  };
}

export function setLastUsed(state: BackendRegistryState, url: string): BackendRegistryState {
  return { ...state, currentId: url };
}

/** The backend to autoconnect to, if any. */
export function lastUsed(state: BackendRegistryState): BackendEntry | undefined {
  return state.backends.find((b) => b.url === state.currentId);
}
