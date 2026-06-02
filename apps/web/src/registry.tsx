/**
 * Solid-side wrapper around @clio/core's backend registry — Wave 2.
 *
 * Owns the BackendRegistryState signal, a hydration `onMount` that
 * loads from `Persistence`, and helper functions the UI calls (add /
 * remove / select). Components subscribe via the createBackendRegistry()
 * factory or via the React-style `BackendRegistryContext` Solid context.
 */

import {
  createContext,
  createSignal,
  onMount,
  type Accessor,
  type ParentComponent,
} from 'solid-js';
import { useContext } from 'solid-js';
import {
  addBackend as reduceAdd,
  currentBackend as reduceCurrent,
  EMPTY_REGISTRY,
  removeBackend as reduceRemove,
  setCurrent as reduceSetCurrent,
  updateBackend as reduceUpdate,
  LocalStoragePersistence,
  type BackendEntry,
  type BackendRegistryState,
  type Persistence,
} from '@clio/core';
import { Client } from '@clio/core';
import { getRequestLocale } from './locale.js';
import { inTauri, tauriFetch } from './tauri.js';

export interface BackendRegistry {
  state: Accessor<BackendRegistryState>;
  current: Accessor<BackendEntry | null>;
  add: (entry: BackendEntry) => void;
  remove: (id: string) => void;
  select: (id: string) => void;
  update: (id: string, patch: Partial<BackendEntry>) => void;
  /**
   * Probes /v1/capabilities for the named backend and stores the result
   * (or `lastError`) on the entry. Called when the user adds a new
   * backend and after a successful sidecar boot.
   */
  refreshCapabilities: (id: string) => Promise<void>;
}

export interface BackendRegistryOptions {
  persistence?: Persistence;
}

export function createBackendRegistry(
  opts: BackendRegistryOptions = {},
): BackendRegistry {
  const persistence = opts.persistence ?? new LocalStoragePersistence();
  const [state, setState] = createSignal<BackendRegistryState>(EMPTY_REGISTRY);

  onMount(async () => {
    const hydrated = await persistence.load();
    setState(hydrated);
  });

  function commit(next: BackendRegistryState) {
    setState(next);
    void persistence.save(next);
  }

  function add(entry: BackendEntry) {
    commit(reduceAdd(state(), entry));
  }
  function remove(id: string) {
    commit(reduceRemove(state(), id));
  }
  function select(id: string) {
    commit(reduceSetCurrent(state(), id));
  }
  function update(id: string, patch: Partial<BackendEntry>) {
    commit(reduceUpdate(state(), id, patch));
  }
  async function refreshCapabilities(id: string) {
    const entry = state().backends.find((b) => b.id === id);
    if (!entry) return;
    try {
      const c = new Client({
        baseUrl: entry.url,
        bearerToken: entry.bearerToken,
        fetch: inTauri() ? tauriFetch : undefined,
        getLocale: getRequestLocale,
      });
      const caps = await c.capabilities();
      update(id, { capabilities: caps, lastError: undefined });
    } catch (e) {
      update(id, {
        lastError: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    state,
    current: () => reduceCurrent(state()),
    add,
    remove,
    select,
    update,
    refreshCapabilities,
  };
}

export const BackendRegistryContext = createContext<BackendRegistry | null>(null);

export const BackendRegistryProvider: ParentComponent<{
  registry: BackendRegistry;
}> = (p) => (
  <BackendRegistryContext.Provider value={p.registry}>
    {p.children}
  </BackendRegistryContext.Provider>
);

export function useBackendRegistry(): BackendRegistry {
  const ctx = useContext(BackendRegistryContext);
  if (!ctx) throw new Error('useBackendRegistry() outside provider');
  return ctx;
}
