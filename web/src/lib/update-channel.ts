import { useSyncExternalStore } from 'react';
import { isBetaVersion } from './release-version';

export type UpdateChannel = 'stable' | 'beta';
const STORAGE_KEY = 'clio.update-channel';
const listeners = new Set<() => void>();
let fallback: UpdateChannel = 'stable';
let storageUnavailableChoice = false;

/** Read the saved choice; existing beta installations retain their beta channel. */
export function getUpdateChannel(): UpdateChannel {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'stable' || saved === 'beta') return saved;
  } catch {
    // Storage can be disabled; the in-memory choice remains usable for this run.
  }
  return fallback;
}

/** Persist an explicit choice, which always takes precedence over the installed version. */
export function setUpdateChannel(channel: UpdateChannel): void {
  fallback = channel;
  try {
    localStorage.setItem(STORAGE_KEY, channel);
  } catch {
    // Keep the active choice usable even when persistence is unavailable.
    storageUnavailableChoice = true;
  }
  for (const listener of listeners) listener();
}

/** Infer a default once for an existing installation, without overriding an opt-out. */
export function initializeUpdateChannel(installedVersion: string | undefined): void {
  if (!installedVersion) return;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'stable' || saved === 'beta') return;
  } catch {
    // Use the version-derived default when no persistent choice is readable.
    if (storageUnavailableChoice) return;
  }
  setUpdateChannel(isBetaVersion(installedVersion) ? 'beta' : 'stable');
}

export function subscribeUpdateChannel(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Keep Settings and both version indicators synchronized without a reload. */
export function useUpdateChannel(): UpdateChannel {
  return useSyncExternalStore(subscribeUpdateChannel, getUpdateChannel, getUpdateChannel);
}
