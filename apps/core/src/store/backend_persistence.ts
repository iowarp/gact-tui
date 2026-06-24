import type { BackendRegistryState, Persistence } from './backend_types.js';
import { EMPTY_REGISTRY } from './backend_types.js';

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
