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
import { vocab } from '@/lib/brand-vocabulary';
import {
  deleteConnectionCredential,
  readConnectionCredential,
  storeConnectionCredential,
} from '@/tauri/secure-credentials';
import { waitForManagedBackend, type ManagedBackendStatus } from '@/tauri/managed-backend';
import { finishInstallerInfrastructure } from '@/lib/installer-infrastructure';
import { openSshTunnel, type SshTunnelSettings } from '@/tauri/ssh-tunnel';

const RECENT_CONNECTIONS_KEY = 'clio.recent-connections';
/**
 * Endpoints kept in the remembered-connections list. Unit: connections.
 * Bounds both the stored value and what is read back, so an oversized or
 * hand-edited localStorage entry cannot grow the picker without limit.
 */
const RECENT_CONNECTIONS_LIMIT = 5;

function parseTunnel(value: unknown): SshTunnelSettings | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (
    typeof item.host !== 'string' ||
    typeof item.user !== 'string' ||
    typeof item.remote_port !== 'number' ||
    typeof item.key_path !== 'string'
  ) {
    return undefined;
  }
  return {
    host: item.host,
    user: item.user,
    remote_port: item.remote_port,
    key_path: item.key_path,
    ...(typeof item.profile === 'string' ? { profile: item.profile } : {}),
    ...(typeof item.port === 'number' ? { port: item.port } : {}),
    ...(typeof item.local_port === 'number' ? { local_port: item.local_port } : {}),
  };
}

interface ConnectionContextValue {
  settings: ConnectionSettings;
  recents: SavedConnection[];
  credentialsReady: boolean;
  managedConnectionReady: boolean;
  isManagedConnection: boolean;
  managedBackendStatus?: ManagedBackendStatus;
  credentialError?: string;
  resolveConnection: (settings: ConnectionSettings) => Promise<ConnectionSettings>;
  connect: (settings: ConnectionSettings) => Promise<void>;
  forget: (endpoint: string) => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

function readRecents(): SavedConnection[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_CONNECTIONS_KEY) ?? '[]') as unknown;
    const parsed = Array.isArray(value)
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
                  ...('tunnel' in item && parseTunnel(item.tunnel)
                    ? { tunnel: parseTunnel(item.tunnel) }
                    : {}),
                },
              ];
            }
            return [];
          })
          .slice(0, RECENT_CONNECTIONS_LIMIT)
      : [];
    // Desktop builds before managed endpoints became launch-scoped persisted
    // their random loopback ports as separate "This computer" services. They
    // are stale process addresses, not distinct agents, and cannot reconnect
    // after the next launch. Remove those legacy rows while retaining named
    // tunnels such as a homelab connection that also terminates on loopback.
    const migrated = parsed.filter((connection) => !isLegacyManagedConnection(connection));
    if (migrated.length !== parsed.length) {
      localStorage.setItem(RECENT_CONNECTIONS_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return [];
  }
}

function isLegacyManagedConnection(connection: SavedConnection): boolean {
  if (connection.tunnel) return false;
  const label = connection.label?.trim().toLocaleLowerCase();
  if (label !== 'this computer' && label !== 'this device') return false;
  try {
    return ['127.0.0.1', 'localhost', '::1'].includes(
      new URL(connection.endpoint).hostname.toLocaleLowerCase(),
    );
  } catch {
    return false;
  }
}

export function ConnectionProvider({ children }: PropsWithChildren) {
  const [recents, setRecents] = useState<SavedConnection[]>(readRecents);
  const [settings, setSettings] = useState<ConnectionSettings>(() => ({
    endpoint: recents[0]?.endpoint ?? DEFAULT_ENDPOINT,
    label: recents[0]?.label,
    tunnel: recents[0]?.tunnel,
  }));
  const [credentialsReady, setCredentialsReady] = useState(() => !inTauri());
  const [managedConnectionReady, setManagedConnectionReady] = useState(false);
  const [managedBackendStatus, setManagedBackendStatus] = useState<ManagedBackendStatus>();
  const [credentialError, setCredentialError] = useState<string>();
  /** The supervisor's address is allocated per launch, so it is never remembered. */
  const [managedEndpoint, setManagedEndpoint] = useState<string>();

  useEffect(() => {
    if (!inTauri()) return;
    let cancelled = false;
    void waitForManagedBackend({ onStatus: setManagedBackendStatus })
      .then((handle) => {
        if (cancelled) return;
        const endpoint = normalizeEndpoint(handle.url);
        setManagedEndpoint(endpoint);
        setSettings({ endpoint, token: handle.bearer_token || undefined });
        setManagedConnectionReady(true);
        setCredentialError(undefined);
        void finishInstallerInfrastructure({
          endpoint,
          token: handle.bearer_token || undefined,
        }).catch((error: unknown) => {
          console.error('Could not finish install-selected infrastructure', error);
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCredentialError(
          error instanceof Error
            ? error.message
            : `The managed ${vocab.agent} service is unavailable.`,
        );
      })
      .finally(() => {
        if (!cancelled) setCredentialsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveConnection = useCallback(
    async (next: ConnectionSettings): Promise<ConnectionSettings> => {
      const tunnelHandle = next.tunnel ? await openSshTunnel(next.tunnel) : undefined;
      const endpoint = normalizeEndpoint(tunnelHandle?.local_url ?? next.endpoint);
      const normalized = {
        ...next,
        endpoint,
        label: next.label?.trim() || undefined,
        ...(next.tunnel
          ? {
              tunnel: {
                ...next.tunnel,
                local_port: tunnelHandle?.local_port ?? next.tunnel.local_port,
              },
            }
          : {}),
      };
      if (normalized.token) return normalized;
      if (settings.endpoint === endpoint && settings.token) {
        return { ...normalized, token: settings.token };
      }
      if (managedConnectionReady && settings.endpoint === endpoint) return normalized;
      const token = await readConnectionCredential(endpoint);
      return { ...normalized, token };
    },
    [managedConnectionReady, settings.endpoint, settings.token],
  );

  const connect = useCallback(
    async (next: ConnectionSettings): Promise<void> => {
      const endpoint = normalizeEndpoint(next.endpoint);
      const normalized = { ...next, endpoint, label: next.label?.trim() || undefined };
      const managed = endpoint === managedEndpoint;
      if (normalized.token && !managed) {
        await storeConnectionCredential(endpoint, normalized.token);
      }
      setCredentialError(undefined);
      setSettings(normalized);
      // The supervisor owns the managed address and its token for this launch only;
      // recording it would evict remembered remote endpoints from the saved list.
      if (managed) return;
      setRecents((current) => {
        const updated = [
          { endpoint, label: normalized.label, tunnel: normalized.tunnel },
          ...current.filter((item) => item.endpoint !== endpoint),
        ].slice(0, RECENT_CONNECTIONS_LIMIT);
        localStorage.setItem(RECENT_CONNECTIONS_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    [managedEndpoint],
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
      isManagedConnection: managedConnectionReady && managedEndpoint === settings.endpoint,
      managedBackendStatus,
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
      managedBackendStatus,
      managedEndpoint,
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
