import { useSyncExternalStore } from 'react';
import type { WorkspaceReference } from '@clio/core/v3';

/**
 * Lets a frame outside the composer ("@ Add to message" on a file) put a
 * reference into the conversation's composer, the same reference its @
 * picker inserts. The most recently mounted composer for a workspace wins.
 */
interface ComposerReferenceTarget {
  workspaceId: string;
  add: (reference: WorkspaceReference) => void;
}

let targets: readonly ComposerReferenceTarget[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerComposerReferenceTarget(target: ComposerReferenceTarget): () => void {
  targets = [...targets, target];
  emit();
  return () => {
    targets = targets.filter((candidate) => candidate !== target);
    emit();
  };
}

function targetFor(workspaceId: string | undefined) {
  if (!workspaceId) return undefined;
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    if (targets[index].workspaceId === workspaceId) return targets[index];
  }
  return undefined;
}

/** Adds the reference to the composer for `workspaceId`; false when none is open. */
export function addReferenceToComposer(
  reference: WorkspaceReference,
  workspaceId: string | undefined,
): boolean {
  const target = targetFor(workspaceId);
  if (!target) return false;
  target.add(reference);
  return true;
}

export function useComposerReferenceAvailable(workspaceId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => Boolean(targetFor(workspaceId)),
    () => false,
  );
}
