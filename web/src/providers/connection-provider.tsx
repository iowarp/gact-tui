import { RemoteAgentConflict } from '@/components/clio/remote-agent-conflict';
import { NewClioInstance } from '@/components/clio/managed-service-target-utils';
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
  InfrastructureTargetGoneError,
  normalizeEndpoint,
  type ConnectionSettings,
  type SavedConnection,
  type SavedSshRoute,
} from '@/lib/connection';
import {
  claimClioAgent,
  sshTargetDefinition,
  targetMatchesHost,
  waitForConflictAnswer,
  type ConflictAnswer,
  type FoundConflict,
} from '@/components/clio/managed-service-target-utils';
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
/** The name the user gave the desktop-managed local service (never in `recents`). */
const MANAGED_LABEL_KEY = 'clio.managed-connection-label';

function readManagedLabel(): string | undefined {
  try {
    return localStorage.getItem(MANAGED_LABEL_KEY)?.trim() || undefined;
  } catch {
    return undefined;
  }
}
/**
 * Endpoints kept in the remembered-connections list. Unit: connections.
 * Bounds both the stored value and what is read back, so an oversized or
 * hand-edited localStorage entry cannot grow the picker without limit.
 */
const RECENT_CONNECTIONS_LIMIT = 5;

function parseSavedRoute(value: unknown): SavedSshRoute | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.host !== 'string' || typeof item.label !== 'string') return undefined;
  const platform = item.platform;
  return {
    label: item.label,
    remotePort: typeof item.remotePort === 'number' ? item.remotePort : undefined,
    keepRunning: item.keepRunning === true,
    installRoot: typeof item.installRoot === 'string' ? item.installRoot : '',
    profile: typeof item.profile === 'string' ? item.profile : '',
    host: item.host,
    user: typeof item.user === 'string' ? item.user : '',
    port: typeof item.port === 'number' ? item.port : 22,
    jumpHosts: Array.isArray(item.jumpHosts)
      ? item.jumpHosts.filter((v) => typeof v === 'string')
      : [],
    identityFile: typeof item.identityFile === 'string' ? item.identityFile : '',
    platform: platform === 'linux' || platform === 'windows' ? platform : 'auto',
  };
}

function parseInfrastructure(value: unknown): ConnectionSettings['infrastructure'] {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.targetId !== 'string' || item.serviceId !== 'clio_agent') return undefined;
  const route = parseSavedRoute(item.route);
  return { targetId: item.targetId, serviceId: 'clio_agent', ...(route ? { route } : {}) };
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
  /** The user's name for the managed local service, when they gave one. */
  managedLabel?: string;
  credentialError?: string;
  resolveConnection: (settings: ConnectionSettings) => Promise<ConnectionSettings>;
  connect: (settings: ConnectionSettings) => Promise<void>;
  forget: (endpoint: string) => Promise<void>;
  /**
   * Give a known service a new name: the managed local service keeps its own
   * name; any other service is remembered (saved if it was only discovered).
   */
  rename: (connection: SavedConnection, label: string) => void;
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
  const [managedLabel, setManagedLabel] = useState<string | undefined>(readManagedLabel);
  const [pendingSsh, setPendingSsh] = useState<{
    label: string;
    targetId: string;
    status: SshTransportStatus;
  }>();
  const cancelledSsh = useRef(new Set<string>());
  const [pendingConflict, setPendingConflict] = useState<{
    label: string;
    found: FoundConflict;
  }>();
  const conflictChoice = useRef<((choice: ConflictAnswer) => void) | undefined>(undefined);

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
        const route = next.infrastructure.route;
        const targets = await controller.infrastructureTargets();
        let target = targets.find((candidate) => candidate.id === next.infrastructure?.targetId);
        // A target id is a label slug, not a unique identifier across
        // computers (`store.py`'s `_next_target_id`) -- a match found by id
        // must still be the SAME host the saved route names, or a stale or
        // reused id would attach to (and hand the saved bearer token to) a
        // completely unrelated machine (#1528 review).
        if (target && route && !targetMatchesHost(target, route)) {
          target = undefined;
        }
        let rebuilt = false;
        if (!target && route) {
          // This computer's local CLIO never created (or no longer has) that
          // target's record -- a fresh install after an update, a second
          // computer, or a different local CLIO. Reuse an existing target for
          // this same route before minting a duplicate (the same check
          // `registerTarget` uses for a fresh deploy), and otherwise rebuild
          // it from the saved route, exactly like a fresh "Deploy and
          // connect" would, instead of failing outright (#1528).
          target = targets.find(
            (candidate) =>
              targetMatchesHost(candidate, route) &&
              candidate.install_root === (route.installRoot || ''),
          );
          if (!target) {
            try {
              target = await controller.createInfrastructureTarget(sshTargetDefinition(route));
            } catch {
              throw new InfrastructureTargetGoneError(next.label || 'This connection');
            }
          }
          rebuilt = true;
        }
        if (!target) {
          throw new InfrastructureTargetGoneError(next.label || 'This connection');
        }
        let confirmed = target;
        const status = await attachInfrastructureSshTransport(
          controllerEndpoint,
          controllerToken,
          confirmed,
        );
        let current = status;
        if (current.state !== 'connected') {
          setPendingSsh({
            label: next.label || confirmed.label,
            targetId: confirmed.id,
            status: current,
          });
          for (let attempt = 0; current.state !== 'connected' && attempt < 3_600; attempt += 1) {
            if (cancelledSsh.current.delete(current.session_id)) {
              throw new Error(`SSH authentication for ${confirmed.label} was cancelled.`);
            }
            await new Promise((resolve) => window.setTimeout(resolve, 250));
            try {
              current = await sshTransportStatus(current.session_id);
              if (current.state === 'disconnected') {
                throw new Error(current.failure || `OpenSSH disconnected from ${confirmed.label}.`);
              }
            } catch (error) {
              await controller.setInfrastructureTransportState(
                confirmed.id,
                'reauthentication_required',
              );
              setPendingSsh(undefined);
              throw error;
            }
            setPendingSsh({
              label: next.label || confirmed.label,
              targetId: confirmed.id,
              status: current,
            });
          }
          setPendingSsh(undefined);
        }
        await controller.setInfrastructureTransportState(confirmed.id, current.state);
        if (current.state !== 'connected')
          throw new Error(`SSH authentication timed out for ${confirmed.label}.`);
        await attachInfrastructureSshTransport(controllerEndpoint, controllerToken, confirmed);
        if (rebuilt) {
          // No confirmed service record exists yet for this (re)built target,
          // so the catalog below would only ever report `not_installed` --
          // run the same claim step "Deploy and connect" uses so a CLIO
          // already running on the host is found and adopted, pausing on
          // Connect/Replace for a genuine conflict, instead of failing
          // outright on a host that already has a working CLIO (#1528 review).
          const claimAbort = new AbortController();
          const { invoke } = await import('@tauri-apps/api/core');
          const desktopId = await invoke<string>('desktop_deployment_owner');
          let port = route?.remotePort ?? 17800;
          for (;;) {
            try {
              await claimClioAgent(
                controller,
                confirmed.id,
                claimAbort.signal,
                async (found) => {
                  setPendingConflict({ label: next.label || confirmed.label, found });
                  try {
                    return await waitForConflictAnswer(claimAbort.signal, conflictChoice);
                  } finally {
                    setPendingConflict(undefined);
                  }
                },
                undefined,
                {
                  port: String(port),
                  desktop_id: desktopId,
                  keep_running: String(route?.keepRunning ?? false),
                },
              );
              break;
            } catch (error) {
              if (error instanceof NewClioInstance && route && error.conflict.owner) {
                port += 1;
                if (port > 65535) throw new Error('Choose a lower port to start another agent.');
                const nextRoute = {
                  ...route,
                  installRoot: `${error.conflict.owner}-instance-${port}`,
                  remotePort: port,
                };
                confirmed = await controller.createInfrastructureTarget(
                  sshTargetDefinition(nextRoute),
                );
                await attachInfrastructureSshTransport(
                  controllerEndpoint,
                  controllerToken,
                  confirmed,
                );
                next = {
                  ...next,
                  infrastructure: {
                    targetId: confirmed.id,
                    serviceId: 'clio_agent',
                    route: nextRoute,
                  },
                };
                continue;
              }
              if (error instanceof DOMException && error.name === 'AbortError') {
                throw new Error(`Connecting to ${confirmed.label} was cancelled.`);
              }
              throw error;
            }
          }
        }
        const catalog = await controller.managedServiceCatalog(confirmed.id);
        const service = catalog.services.find(
          (candidate) => candidate.id === next.infrastructure?.serviceId,
        );
        if (service?.state !== 'running' || !service.connection_url) {
          throw new Error(
            `The managed ${vocab.agent} service is not running on ${confirmed.label}.`,
          );
        }
        next = {
          ...next,
          endpoint: service.connection_url,
          // A rebuild above may have minted a new target id (or the saved
          // one just happened to collide with something else); carry the
          // real one forward so it is what gets remembered next.
          infrastructure: {
            ...next.infrastructure,
            targetId: confirmed.id,
            serviceId: 'clio_agent',
          },
        };
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
      // Its name is kept on its own.
      if (managed) {
        if (normalized.label) {
          localStorage.setItem(MANAGED_LABEL_KEY, normalized.label);
          setManagedLabel(normalized.label);
        }
        return;
      }
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

  const rename = useCallback(
    (connection: SavedConnection, label: string) => {
      const endpoint = normalizeEndpoint(connection.endpoint);
      const name = label.trim();
      if (!name) return;
      setSettings((current) =>
        current.endpoint === endpoint ? { ...current, label: name } : current,
      );
      if (endpoint === managedEndpoint) {
        localStorage.setItem(MANAGED_LABEL_KEY, name);
        setManagedLabel(name);
        return;
      }
      setRecents((current) => {
        const saved = current.some((item) => item.endpoint === endpoint);
        const updated = saved
          ? current.map((item) => (item.endpoint === endpoint ? { ...item, label: name } : item))
          : [
              {
                endpoint,
                label: name,
                location: connection.location,
                infrastructure: connection.infrastructure,
              },
              ...current,
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
      managedLabel,
      credentialError,
      resolveConnection,
      connect,
      forget,
      rename,
    }),
    [
      connect,
      credentialError,
      credentialsReady,
      forget,
      managedConnection,
      managedConnectionReady,
      managedLabel,
      managedBackendStatus,
      managedEndpoint,
      recents,
      rename,
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
      <Dialog
        onOpenChange={(open) => {
          if (open || !pendingConflict) return;
          conflictChoice.current?.('cancelled');
        }}
        open={Boolean(pendingConflict)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {vocab.agent} already on {pendingConflict?.label}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Choose whether to connect to the running {vocab.agent} or replace it.
            </DialogDescription>
          </DialogHeader>
          {pendingConflict ? (
            <RemoteAgentConflict
              found={pendingConflict.found}
              label={pendingConflict.label}
              onChoice={(choice) => conflictChoice.current?.(choice)}
            />
          ) : null}
          <p className="text-xs text-muted-foreground">
            Agents started here stop when this Desktop closes unless the saved connection opted to
            keep them running.
          </p>
          <DialogFooter>
            <Button
              onClick={() => conflictChoice.current?.('cancelled')}
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
