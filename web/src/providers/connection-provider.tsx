import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import {
  DEFAULT_ENDPOINT,
  normalizeEndpoint,
  type ConnectionSettings,
  type SavedConnection,
} from '@/lib/connection';

const RECENT_CONNECTIONS_KEY = 'clio.recent-connections';

interface ConnectionContextValue {
  settings: ConnectionSettings;
  recents: SavedConnection[];
  connect: (settings: ConnectionSettings) => void;
  forget: (endpoint: string) => void;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

function readRecents(): SavedConnection[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_CONNECTIONS_KEY) ?? '[]') as unknown;
    return Array.isArray(value)
      ? value
          .flatMap((item): SavedConnection[] => {
            if (typeof item === 'string') return [{ endpoint: item }];
            if (
              item &&
              typeof item === 'object' &&
              'endpoint' in item &&
              typeof item.endpoint === 'string'
            ) {
              return [
                {
                  endpoint: item.endpoint,
                  ...('label' in item && typeof item.label === 'string'
                    ? { label: item.label }
                    : {}),
                },
              ];
            }
            return [];
          })
          .slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export function ConnectionProvider({ children }: PropsWithChildren) {
  const [recents, setRecents] = useState<SavedConnection[]>(readRecents);
  const [settings, setSettings] = useState<ConnectionSettings>(() => ({
    endpoint: recents[0]?.endpoint ?? DEFAULT_ENDPOINT,
    label: recents[0]?.label,
  }));

  const value = useMemo<ConnectionContextValue>(
    () => ({
      settings,
      recents,
      connect: (next) => {
        const endpoint = normalizeEndpoint(next.endpoint);
        const normalized = { ...next, endpoint, label: next.label?.trim() || undefined };
        const updated = [
          { endpoint, label: normalized.label },
          ...recents.filter((item) => item.endpoint !== endpoint),
        ].slice(0, 5);
        setSettings(normalized);
        setRecents(updated);
        localStorage.setItem(RECENT_CONNECTIONS_KEY, JSON.stringify(updated));
      },
      forget: (endpoint) => {
        const updated = recents.filter((item) => item.endpoint !== endpoint);
        setRecents(updated);
        localStorage.setItem(RECENT_CONNECTIONS_KEY, JSON.stringify(updated));
      },
    }),
    [recents, settings],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

// Provider and hook intentionally share one private context identity.
// oxlint-disable-next-line react/only-export-components
export function useConnectionSettings(): ConnectionContextValue {
  const value = useContext(ConnectionContext);
  if (!value) throw new Error('useConnectionSettings must be used inside ConnectionProvider');
  return value;
}
