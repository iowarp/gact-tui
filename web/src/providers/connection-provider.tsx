import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import {
  attachInfrastructureSshTransport,
  closeInfrastructureSshTransport,
  recoverInfrastructureSshTransports,
  sshTransportStatus,
  type SshTransportStatus,
} from '@/tauri/ssh-infrastructure-transport';
import { createRepository } from '@/lib/connection';
import { SshAuthentication } from '@/components/clio/managed-service-target';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listen } from '@tauri-apps/api/event';

const RECENT_CONNECTIONS_KEY = 'clio.recent-connections';
/**
 * Endpoints kept in the remembered-connections list. Unit: connections.
 * Bounds both the stored value and what is read back, so an oversized or
 * hand-edited localStorage entry cannot grow the picker without limit.
 */
const RECENT_CONNECTIONS_LIMIT = 5;

function parseInfrastructure(value: unknown): ConnectionSettings['infrastructure'] {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.targetId !== 'string' || item.serviceId !== 'clio_agent') return undefined;
  return { targetId: item.targetId, serviceId: 'clio_agent' };
}

interface ConnectionContextValue {
  settings: ConnectionSettings;
  recents: SavedConnection[];
  credentialsReady: boolean;
  managedConnectionReady: boolean;
  isManagedConnection: boolean;
  managedBackendStatus?: ManagedBackendStatus;
  /**
   * The desktop-managed local service's own endpoint + token, once known --
   * distinct from `settings` (the ACTIVE connection, which can move to a
   * different remote service) and never written to `recents` (see `connect`
   * below). This is what lets the connect page list "This computer" as a
   * known service to click, even before anyone has explicitly connected to
   * it this session.
   */
  managedConnection?: ConnectionSettings;
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
                  ...('location' in item && typeof item.location === 'string'
                    ? { location: item.location }
                    : {}),
                  ...('infrastructure' in item && parseInfrastructure(item.infrastructure)
                    ? { infrastructure: parseInfrastructure(item.infrastructure) }
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
    location: recents[0]?.location,
    infrastructure: recents[0]?.infrastructure,
  }));
  const [credentialsReady, setCredentialsReady] = useState(() => !inTauri());
  const [managedConnectionReady, setManagedConnectionReady] = useState(false);
  const [managedBackendStatus, setManagedBackendStatus] = useState<ManagedBackendStatus>();
  const [credentialError, setCredentialError] = useState<string>();
  /** The supervisor's address is allocated per launch, so it is never remembered. */
  const [managedEndpoint, setManagedEndpoint] = useState<string>();
  const [managedConnection, setManagedConnection] = useState<ConnectionSettings>();
  const [pendingSsh, setPendingSsh] = useState<{
    label: string;
    targetId: string;
    status: SshTransportStatus;
  }>();
  const cancelledSsh = useRef(new Set<string>());

  useEffect(() => {
    if (!inTauri()) return;
    let cancelled = false;
    void waitForManagedBackend({ onStatus: setManagedBackendStatus })
      .then((handle) => {
        if (cancelled) return;
        const endpoint = normalizeEndpoint(handle.url);
        const token = handle.bearer_token || undefined;
        setManagedEndpoint(endpoint);
        setManagedConnection({ endpoint, token });
        setSettings({ endpoint, token });
        setManagedConnectionReady(true);
        setCredentialError(undefined);
        void recoverInfrastructureSshTransports(
          createRepository({ endpoint, token }),
          endpoint,
          token,
        ).catch((error: unknown) => {
          console.error('Could not restore managed SSH transports', error);
        });
        void finishInstallerInfrastructure({
          endpoint,
          token,
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

  useEffect(() => {
    if (!inTauri() || !managedConnectionReady || settings.endpoint !== managedEndpoint) return;
    let stop: (() => void) | undefined;
    void Promise.resolve().then(async () => {
      stop = await listen('clio:desktop-resumed', () => {
        void recoverInfrastructureSshTransports(
          createRepository(settings),
          settings.endpoint,
          settings.token,
        ).catch((error: unknown) => {
          console.error('Could not restore managed SSH transports after resume', error);
        });
      });
    });
    return () => stop?.();
  }, [managedBackendStatus, managedConnectionReady, managedEndpoint, settings]);

  const resolveConnection = useCallback(
    async (next: ConnectionSettings): Promise<ConnectionSettings> => {
      if (next.infrastructure) {
        const handle = await waitForManagedBackend({});
        const controllerEndpoint = normalizeEndpoint(handle.url);
        const controllerToken = handle.bearer_token || undefined;
        const controller = createRepository({
          endpoint: controllerEndpoint,
          token: controllerToken,
        });
        const target = (await controller.infrastructureTargets()).find(
          (candidate) => candidate.id === next.infrastructure?.targetId,
        );
        if (!target) throw new Error(`The ${vocab.agent}-owned SSH target no longer exists.`);
        const status = await attachInfrastructureSshTransport(
          controllerEndpoint,
          controllerToken,
          target,
        );
        let current = status;
        if (current.state !== 'connected') {
          setPendingSsh({ label: target.label, targetId: target.id, status: current });
          for (let attempt = 0; current.state !== 'connected' && attempt < 3_600; attempt += 1) {
            if (cancelledSsh.current.delete(current.session_id)) {
              throw new Error(`SSH authentication for ${target.label} was cancelled.`);
            }
            await new Promise((resolve) => window.setTimeout(resolve, 250));
            try {
              current = await sshTransportStatus(current.session_id);
            } catch (error) {
              await controller.setInfrastructureTransportState(
                target.id,
                'reauthentication_required',
              );
              setPendingSsh(undefined);
              throw error;
            }
            setPendingSsh({ label: target.label, targetId: target.id, status: current });
          }
          setPendingSsh(undefined);
        }
        await controller.setInfrastructureTransportState(target.id, current.state);
        if (current.state !== 'connected')
          throw new Error(`SSH authentication timed out for ${target.label}.`);
        await attachInfrastructureSshTransport(controllerEndpoint, controllerToken, target);
        const catalog = await controller.managedServiceCatalog(target.id);
        const service = catalog.services.find(
          (candidate) => candidate.id === next.infrastructure?.serviceId,
        );
        if (service?.state !== 'running' || !service.connection_url) {
          throw new Error(`The managed ${vocab.agent} service is not running on ${target.label}.`);
        }
        next = { ...next, endpoint: service.connection_url };
      }
      const endpoint = normalizeEndpoint(next.endpoint);
      const normalized = {
        ...next,
        endpoint,
        label: next.label?.trim() || undefined,
        location: next.location?.trim() || undefined,
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
      const normalized = {
        ...next,
        endpoint,
        label: next.label?.trim() || undefined,
        location: next.location?.trim() || undefined,
      };
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
          {
            endpoint,
            label: normalized.label,
            location: normalized.location,
            infrastructure: normalized.infrastructure,
          },
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
      managedConnection,
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
      managedConnection,
      managedConnectionReady,
      managedBackendStatus,
      managedEndpoint,
      recents,
      resolveConnection,
      settings,
    ],
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
      <Dialog
        onOpenChange={(open) => {
          if (open || !pendingSsh) return;
          cancelledSsh.current.add(pendingSsh.status.session_id);
          void closeInfrastructureSshTransport(pendingSsh.targetId);
          setPendingSsh(undefined);
        }}
        open={Boolean(pendingSsh)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Connect to {pendingSsh?.label}</DialogTitle>
            <DialogDescription className="sr-only">
              Answer the prompts from system OpenSSH.
            </DialogDescription>
          </DialogHeader>
          {pendingSsh?.status.prompt ? (
            <SshAuthentication
              prompt={pendingSsh.status.prompt}
              sessionId={pendingSsh.status.session_id}
            />
          ) : pendingSsh ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner aria-hidden="true" /> Connecting…
            </p>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => {
                if (!pendingSsh) return;
                cancelledSsh.current.add(pendingSsh.status.session_id);
                void closeInfrastructureSshTransport(pendingSsh.targetId);
                setPendingSsh(undefined);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConnectionContext.Provider>
  );
}

// Provider and hook intentionally share one private context identity.
// oxlint-disable-next-line react/only-export-components
export function useConnectionSettings(): ConnectionContextValue {
  const value = useContext(ConnectionContext);
  if (!value) throw new Error('useConnectionSettings must be used inside ConnectionProvider');
  return value;
}
