import { useCallback, useSyncExternalStore } from 'react';
import type { InlineReferenceSelection } from './composer-reference-domain';

/**
 * A draft put aside with Ctrl+S (⌘S on a Mac). It waits in the composer's dash
 * above the editor, is never sent, and comes back with Up in an empty editor.
 * Saved drafts live for this page only, one list per conversation.
 */
export interface SavedDraft {
  id: string;
  text: string;
  references: readonly InlineReferenceSelection[];
}

const EMPTY: readonly SavedDraft[] = [];
const drafts = new Map<string, readonly SavedDraft[]>();
const listeners = new Set<() => void>();
let nextId = 0;

function write(key: string, next: readonly SavedDraft[]) {
  if (next.length) drafts.set(key, next);
  else drafts.delete(key);
  for (const listener of listeners) listener();
}

export function savedDrafts(key: string): readonly SavedDraft[] {
  return drafts.get(key) ?? EMPTY;
}

/** Puts a draft aside, newest last. */
export function saveDraft(key: string, draft: Omit<SavedDraft, 'id'>): SavedDraft | undefined {
  if (!draft.text.trim() && draft.references.length === 0) return undefined;
  nextId += 1;
  const saved: SavedDraft = { ...draft, id: `saved-draft-${nextId}` };
  write(key, [...savedDrafts(key), saved]);
  return saved;
}

/** Takes a saved draft back out: the one named, or the newest. */
export function takeSavedDraft(key: string, id?: string): SavedDraft | undefined {
  const list = savedDrafts(key);
  const draft = id === undefined ? list.at(-1) : list.find((item) => item.id === id);
  if (draft)
    write(
      key,
      list.filter((item) => item !== draft),
    );
  return draft;
}

export function deleteSavedDraft(key: string, id: string) {
  const list = savedDrafts(key);
  if (list.some((item) => item.id === id))
    write(
      key,
      list.filter((item) => item.id !== id),
    );
}

/** Test seam: forget every saved draft. */
export function clearSavedDrafts() {
  drafts.clear();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSavedDrafts(key: string): readonly SavedDraft[] {
  const read = useCallback(() => savedDrafts(key), [key]);
  return useSyncExternalStore(subscribe, read, read);
}
