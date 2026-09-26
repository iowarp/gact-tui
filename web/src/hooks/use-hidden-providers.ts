import { useCallback, useEffect, useState } from 'react';
import { PROVIDER_VISIBILITY_CHANGED_EVENT } from '@/lib/installer-infrastructure';

export const HIDDEN_PROVIDERS_STORAGE_KEY = 'clio.hidden-providers.v1';

/** The stored hidden set, or `undefined` when storage cannot be read. */
function readStoredHiddenProviders(): Set<string> | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = JSON.parse(window.localStorage.getItem(HIDDEN_PROVIDERS_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);
  } catch {
    return undefined;
  }
}

/** Whether the set was stored (it can only be shared with other surfaces then). */
function persistHiddenProviders(providerIds: Set<string>): boolean {
  try {
    window.localStorage.setItem(
      HIDDEN_PROVIDERS_STORAGE_KEY,
      JSON.stringify([...providerIds].sort()),
    );
    return true;
  } catch {
    // Storage can be full or blocked outright (private windows, a locked-down
    // profile). Hiding a provider is a convenience for this tab; losing it
    // across reloads is not worth taking the surface down with an exception,
    // and the reader is guarded the same way.
    return false;
  }
}

/**
 * Which providers the model picker hides -- ONE store shared by the picker's
 * "Hidden (N)" mode, Settings > Providers and the installer hand-off. Every
 * change notifies the other mounted surfaces (the `storage` event never
 * fires in the document that wrote), so a provider shown from Settings is
 * shown in an open picker too.
 */
export function useHiddenProviders() {
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(
    () => readStoredHiddenProviders() ?? new Set(),
  );
  useEffect(() => {
    // Unreadable storage keeps this tab's in-memory set rather than wiping it.
    const refresh = () => {
      const stored = readStoredHiddenProviders();
      if (stored) setHiddenProviders(stored);
    };
    window.addEventListener(PROVIDER_VISIBILITY_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROVIDER_VISIBILITY_CHANGED_EVENT, refresh);
  }, []);
  const setProviderHidden = useCallback(
    (providerId: string, hidden: boolean): Set<string> => {
      const next = new Set(hiddenProviders);
      if (hidden) next.add(providerId);
      else next.delete(providerId);
      setHiddenProviders(next);
      // Only a stored change is announced: the other surfaces re-read storage,
      // which would otherwise revert this tab's in-memory choice.
      if (persistHiddenProviders(next)) {
        window.dispatchEvent(new Event(PROVIDER_VISIBILITY_CHANGED_EVENT));
      }
      return next;
    },
    [hiddenProviders],
  );
  return { hiddenProviders, setProviderHidden };
}
