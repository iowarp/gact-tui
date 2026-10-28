import { useEffect } from 'react';
import { create } from 'zustand';

/** A selection `openView` applies in the view it opens: written at `path` there. */
export interface ViewSelection {
  path: string;
  field: string;
  values: string[];
}

/**
 * What the `openView` catalog function needs from the workspace page: opening a
 * study view (its `view` entry id) or a dashboard (its `artifact://` URI) from any
 * conversation of the workspace. Like `openArtifact`'s runtime, the one workspace
 * route registers it; catalog functions run outside React.
 */
export interface A2uiOpenViewRuntime {
  openView: (view: string, selection?: ViewSelection) => void;
}

let activeRuntime: A2uiOpenViewRuntime | undefined;

export function setActiveA2uiOpenViewRuntime(runtime: A2uiOpenViewRuntime | undefined): void {
  activeRuntime = runtime;
}

export function activeA2uiOpenViewRuntime(): A2uiOpenViewRuntime | undefined {
  return activeRuntime;
}

type SelectionListener = (selection: ViewSelection) => void;
const opened = new Map<string, ViewSelection>();
const listeners = new Map<string, Set<SelectionListener>>();
const surfaceKey = (sessionId: string, surfaceId: string) => `${sessionId}\u0000${surfaceId}`;

/**
 * Hands `selection` to the surface `surfaceId` of `sessionId`: applied at once when
 * that surface is shown, and again whenever it mounts later (a remount, such as
 * maximizing it, starts from the surface's own seeded data), until another view
 * opens onto it.
 */
export function requestViewSelection(
  sessionId: string,
  surfaceId: string,
  selection: ViewSelection,
): void {
  const key = surfaceKey(sessionId, surfaceId);
  opened.set(key, selection);
  for (const listener of listeners.get(key) ?? []) listener(selection);
}

/** Subscribes a mounted surface to the selections opened onto it; returns the unsubscribe. */
export function subscribeViewSelection(
  sessionId: string,
  surfaceId: string,
  listener: SelectionListener,
): () => void {
  const key = surfaceKey(sessionId, surfaceId);
  const set = listeners.get(key) ?? new Set<SelectionListener>();
  set.add(listener);
  listeners.set(key, set);
  const selection = opened.get(key);
  if (selection) listener(selection);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(key);
  };
}

/** The study view the Science log should show next (its `view` entry id). */
export const useStudyViewFocus = create<{
  entry?: string;
  nonce: number;
  focus: (entry: string) => void;
  clear: () => void;
}>((set) => ({
  nonce: 0,
  focus: (entry) => set((state) => ({ entry, nonce: state.nonce + 1 })),
  clear: () => set({ entry: undefined }),
}));

/**
 * Applies to a mounted surface's data model each selection `openView` opens onto it,
 * as a selection state at its path (`source: 'openView'`).
 */
export function useOpenedViewSelection(
  sessionId: string,
  surfaceId: string,
  model: { dataModel: { set: (path: string, value: unknown) => void } } | undefined,
): void {
  useEffect(() => {
    if (!model) return;
    return subscribeViewSelection(sessionId, surfaceId, ({ path, field, values }) =>
      model.dataModel.set(path, { field, values: [...values], source: 'openView' }),
    );
  }, [model, sessionId, surfaceId]);
}
