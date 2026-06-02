/**
 * Persistent backend registry — Wave 2.
 *
 * A "backend" is a single GACT-conformant endpoint the user has
 * registered with CLIO Desktop / Web. The first entry is the bundled
 * local sidecar (URL + bearer minted by the Tauri supervisor); any
 * subsequent entries are added via /settings/backends/add-remote (or
 * the SSH tunnel wizard on desktop).
 *
 * The store is intentionally storage-agnostic — both InMemory and
 * LocalStorage implementations live here so the same logic works in
 * tests, in the pure-web build, and (with a future Tauri-store impl
 * for the OS keychain) on desktop.
 */

import type { Capabilities } from '../wire/types.js';

export type BackendKind = 'local-sidecar' | 'http' | 'ssh-tunnel';

export interface BackendEntry {
  id: string;
  /** Human-readable label shown in the picker chip. */
  label: string;
  url: string;
  bearerToken: string;
  kind: BackendKind;
  /**
   * Last observed /v1/capabilities payload, if any. Used for capability
   * gating in the UI; refreshed each time the user selects the backend.
   */
  capabilities?: Capabilities;
  /** Last error message from a failed health probe. */
  lastError?: string;
  /** SSH-specific config — only populated when kind === 'ssh-tunnel'. */
  ssh?: {
    host: string;
    user: string;
    keyPath: string;
    /** Local tunneled port (kept here so the same tunnel can be reopened). */
    localPort?: number;
  };
}

export interface BackendRegistryState {
  /** Stable ordering — first entry is the auto-selected default. */
  backends: BackendEntry[];
  /** Currently selected backend id, or null when none has been chosen. */
  currentId: string | null;
}

export interface Persistence {
  load(): Promise<BackendRegistryState>;
  save(state: BackendRegistryState): Promise<void>;
}

export const EMPTY_REGISTRY: BackendRegistryState = {
  backends: [],
  currentId: null,
};

const STORAGE_KEY = 'clio.backends.v1';

/**
 * Used in unit tests and as a fallback when no other storage is
 * available (e.g. SSR-style renders, or first-run before Tauri's
 * store plugin is wired).
 */
export class InMemoryPersistence implements Persistence {
  constructor(private state: BackendRegistryState = EMPTY_REGISTRY) {}

  async load(): Promise<BackendRegistryState> {
    return clone(this.state);
  }

  async save(state: BackendRegistryState): Promise<void> {
    this.state = clone(state);
  }
}

/**
 * Browser-side persistence backed by `window.localStorage`. Suitable
 * for the pure-web build and as a development fallback on desktop. The
 * desktop production build should swap this out for a Tauri-store /
 * OS-keychain implementation that protects the bearer tokens at rest.
 */
export class LocalStoragePersistence implements Persistence {
  constructor(private readonly storage: Storage = globalStorage()) {}

  async load(): Promise<BackendRegistryState> {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return EMPTY_REGISTRY;
      const parsed = JSON.parse(raw) as BackendRegistryState;
      if (!Array.isArray(parsed.backends)) return EMPTY_REGISTRY;
      return parsed;
    } catch {
      return EMPTY_REGISTRY;
    }
  }

  async save(state: BackendRegistryState): Promise<void> {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage can throw on quota / private-mode; the registry
      // remains in-memory for the current session.
    }
  }
}

function globalStorage(): Storage {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  // Tests / Node: in-memory shim that satisfies the Storage shape.
  const m = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => Array.from(m.keys())[i] ?? null,
    removeItem: (k) => {
      m.delete(k);
    },
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
  return shim;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/* ---------------------- Reducers ---------------------- */
/* Pure functions that produce the next state — the SolidJS signal in
 * @clio/web is the only place that owns the live state object; these
 * keep the algebra testable in @clio/core unit tests.                */

export function addBackend(
  state: BackendRegistryState,
  entry: BackendEntry,
): BackendRegistryState {
  // Refuse duplicates by id; replace by url+kind so re-adding the same
  // tunnel doesn't bloat the list.
  const dedup = state.backends.filter(
    (b) => b.id !== entry.id && !(b.url === entry.url && b.kind === entry.kind),
  );
  return {
    backends: [...dedup, entry],
    currentId: state.currentId ?? entry.id,
  };
}

export function removeBackend(
  state: BackendRegistryState,
  id: string,
): BackendRegistryState {
  const next = state.backends.filter((b) => b.id !== id);
  const currentId =
    state.currentId === id ? (next[0]?.id ?? null) : state.currentId;
  return { backends: next, currentId };
}

export function setCurrent(
  state: BackendRegistryState,
  id: string,
): BackendRegistryState {
  if (!state.backends.some((b) => b.id === id)) return state;
  return { ...state, currentId: id };
}

export function updateBackend(
  state: BackendRegistryState,
  id: string,
  patch: Partial<BackendEntry>,
): BackendRegistryState {
  return {
    ...state,
    backends: state.backends.map((b) => (b.id === id ? { ...b, ...patch } : b)),
  };
}

export function currentBackend(
  state: BackendRegistryState,
): BackendEntry | null {
  if (!state.currentId) return state.backends[0] ?? null;
  return state.backends.find((b) => b.id === state.currentId) ?? null;
}
