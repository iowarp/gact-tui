import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  DEFAULT_ENDPOINT,
  normalizeEndpoint,
  type ConnectionSettings,
  type SavedConnection,
} from '@/lib/connection';
import { inTauri } from '@/lib/transport/tauri-runtime';
import {
  deleteConnectionCredential,
  readConnectionCredential,
  storeConnectionCredential,
} from '@/tauri/secure-credentials';
import { waitForManagedBackend } from '@/tauri/managed-backend';

const RECENT_CONNECTIONS_KEY = 'clio.recent-connections';

interface ConnectionContextValue {
  settings: ConnectionSettings;
  recents: SavedConnection[];
  credentialsReady: boolean;
  managedConnectionReady: boolean;
  credentialError?: string;
  resolveConnection: (settings: ConnectionSettings) => Promise<ConnectionSettings>;
  connect: (settings: ConnectionSettings) => Promise<void>;
  forget: (endpoint: string) => Promise<void>;
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
  const [credentialsReady, setCredentialsReady] = useState(() => !inTauri());
  const [managedConnectionReady, setManagedConnectionReady] = useState(false);
  const [credentialError, setCredentialError] = useState<string>();

  useEffect(() => {
    if (!inTauri()) return;
    if (recents.length === 0) {
      let cancelled = false;
      void waitForManagedBackend()
        .then((handle) => {
          if (cancelled) return;
          const endpoint = normalizeEndpoint(handle.url);
          setSettings({ endpoint, token: handle.bearer_token || undefined });
          setManagedConnectionReady(true);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setCredentialError(
            error instanceof Error ? error.message : 'The managed CLIO service is unavailable.',
          );
        })
        .finally(() => {
          if (!cancelled) setCredentialsReady(true);
        });
      return () => {
        cancelled = true;
      };
    }
    const endpoint = settings.endpoint;
    let cancelled = false;
    void readConnectionCredential(endpoint)
      .then((token) => {
        if (cancelled) return;
        setSettings((current) => (current.endpoint === endpoint ? { ...current, token } : current));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCredentialError(
          error instanceof Error ? error.message : 'Saved access credentials are unavailable.',
        );
      })
      .finally(() => {
        if (!cancelled) setCredentialsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [recents.length, settings.endpoint]);

  const resolveConnection = useCallback(
    async (next: ConnectionSettings): Promise<ConnectionSettings> => {
      const endpoint = normalizeEndpoint(next.endpoint);
      const normalized = { ...next, endpoint, label: next.label?.trim() || undefined };
      if (normalized.token) return normalized;
      if (settings.endpoint === endpoint && settings.token) {
        return { ...normalized, token: settings.token };
      }
      const token = await readConnectionCredential(endpoint);
      return { ...normalized, token };
    },
    [settings.endpoint, settings.token],
  );

  const connect = useCallback(
    async (next: ConnectionSettings): Promise<void> => {
      const endpoint = normalizeEndpoint(next.endpoint);
      const normalized = { ...next, endpoint, label: next.label?.trim() || undefined };
      if (normalized.token) {
        await storeConnectionCredential(endpoint, normalized.token);
      }
      setCredentialError(undefined);
      if (inTauri() && settings.endpoint !== endpoint) {
        setCredentialsReady(false);
      }
      setSettings(normalized);
      setRecents((current) => {
        const updated = [
          { endpoint, label: normalized.label },
          ...current.filter((item) => item.endpoint !== endpoint),
        ].slice(0, 5);
        localStorage.setItem(RECENT_CONNECTIONS_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    [settings.endpoint],
  );

  const forget = useCallback(async (endpoint: string): Promise<void> => {
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    await deleteConnectionCredential(normalizedEndpoint);
    setRecents((current) => {
      const updated = current.filter((item) => item.endpoint !== normalizedEndpoint);
      localStorage.setItem(RECENT_CONNECTIONS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      settings,
      recents,
      credentialsReady,
      managedConnectionReady,
      credentialError,
      resolveConnection,
      connect,
      forget,
    }),
    [
      connect,
      credentialError,
      credentialsReady,
      forget,
      managedConnectionReady,
      recents,
      resolveConnection,
      settings,
    ],
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
