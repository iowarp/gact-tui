import type { BackendEntry, BackendRegistryState } from './backend_types.js';

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
