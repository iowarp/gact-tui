import { BrandIcon } from '@/components/clio/brand-icon';
import { brand } from '@brand';
import { PROTOCOL_VERSION, TransportError } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderClockIcon, GlobeIcon, LaptopIcon, ServerIcon } from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConnectionAvailabilityIndicator } from '@/components/clio/connection-availability';
import { DesktopBoot, HomeSearchButton } from '@/components/clio/desktop-boot';
import { managedBootStage } from '@/lib/desktop-boot-stage';
import { ConnectFrame } from '@/components/clio/connect-frame';
import { ConnectAddressFields, ConnectErrorLine } from '@/components/clio/connect-address';
import { ListRow } from '@/components/clio/primitives/list-row';
import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { ConnectionWaitingNotice } from '@/components/clio/connection-attempt';
import {
  availabilityAfterAttempt,
  useConnectionWaiting,
  useServedEndpointProbe,
} from '@/lib/connection-attempt';
import { ConnectionEmptyService } from '@/components/clio/connection-empty-service';
import { DeployClioDialog } from '@/components/clio/deploy-clio-dialog';
import { KnownServiceActions } from '@/components/clio/known-service-actions';
import { SavedHostsCheck } from '@/components/clio/saved-hosts-check';
import { queryKeys } from '@/lib/query-keys';
import { reportConnectionOutcome } from '@/lib/connection-outcomes';
import { connectionCapabilities } from '@/lib/connection-capabilities';
import { Button } from '@/components/ui/button';
import { useKnownConnections, type KnownConnection } from '@/hooks/use-known-connections';
import {
  createRepository,
  defaultEndpoint,
  InfrastructureTargetGoneError,
  normalizeEndpoint,
  servedEndpoint,
  type ConnectionSettings,
} from '@/lib/connection';
import {
  connectionCandidateSessions,
  connectionSessionRoute,
  connectionWorkspaceForRoute,
  connectionSessionTargetForRoute,
  latestConnectionSessionTarget,
} from '@/lib/connection-target';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { PROTOCOL, vocab } from '@/lib/brand-vocabulary';
import {
  lastWorkspaceRoute,
  rememberWorkspaceRoute,
  newConversationRoute,
} from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useCommandMenuVisibility } from '@/store/command-menu-visibility';

/** One icon per known-connection source, so the list reads at a glance without a legend. */
function connectionSourceIcon(source: KnownConnection['source']) {
  if (source === 'managed') return LaptopIcon;
  if (source === 'infrastructure') return ServerIcon;
  return FolderClockIcon;
}

export function ConnectionPage() {
  const searchOpen = useCommandMenuVisibility((state) => state.open);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    settings,
    recents,
    credentialsReady,
    managedConnectionReady,
    managedBackendStatus,
    credentialError,
    resolveConnection,
    connect,
    forget,
    rename,
  } = useConnectionSettings();
  // The DEFAULT view: every CLIO the person can click without typing an
  // address (recents, the desktop-managed local service, reachable
  // Infrastructure deployments — see the hook). The manual "Connect by
  // address" form is secondary, reached only through `manualModeRequested`
  // (an explicit "Add a service" click) or because there is nothing known
  // yet to list at all — CLIO is for non-technical people, and ip:port is
  // the non-default way in.
  const knownConnections = useKnownConnections();
  const initialKnownConnection =
    knownConnections.find((connection) => connection.endpoint === settings.endpoint) ??
    knownConnections[0];
  const requestedMode = searchParams.get('mode');
  const [manualModeRequested, setManualModeRequested] = useState(requestedMode === 'address');
  const showManualForm = manualModeRequested || knownConnections.length === 0;
  const [selectedEndpoint, setSelectedEndpoint] = useState(
    initialKnownConnection?.endpoint ?? settings.endpoint,
  );
  const [endpointDraft, setEndpointDraft] = useState(
    initialKnownConnection ? defaultEndpoint() : settings.endpoint,
  );
  const [serviceNameDraft, setServiceNameDraft] = useState(
    initialKnownConnection ? '' : (settings.label ?? ''),
  );
  const [token, setToken] = useState('');
  const [deployOpen, setDeployOpen] = useState(inTauri() && requestedMode === 'deploy');
  // The CLIO menu links here while the page may already be open, so a new
  // `mode` must still open its form or dialog without a remount.
  const [handledMode, setHandledMode] = useState(requestedMode);
  if (handledMode !== requestedMode) {
    setHandledMode(requestedMode);
    if (requestedMode === 'address') setManualModeRequested(true);
    if (requestedMode === 'deploy' && inTauri()) setDeployOpen(true);
  }
  const selectedConnection = knownConnections.find(
    (connection) => connection.endpoint === selectedEndpoint,
  );
  const autoConnectStarted = useRef(false);
  // Mirrors `autoConnectStarted.current` as real state -- read during
  // render below (a ref must never be, see the boot-gate comment there),
  // and set alongside the ref so both flip together the one time
  // auto-connect ever dispatches.
  const [autoConnectDispatched, setAutoConnectDispatched] = useState(false);
  const connectionIntent = searchParams.get('intent');
  // An agent-served page with nothing remembered connects to its own origin (#739 B7).
  const servedAgent =
    recents.length === 0 && connectionIntent !== 'connect' ? servedEndpoint() : undefined;
  const servedProbe = useServedEndpointProbe(servedAgent);
  const shouldConnectAutomatically =
    (recents.length > 0 || managedConnectionReady || servedProbe.pending || servedProbe.answered) &&
    connectionIntent !== 'connect';
  const waitingForManagedService = inTauri() && !credentialsReady && connectionIntent !== 'connect';

  const mutation = useMutation({
    mutationFn: async (candidate: ConnectionSettings) => {
      const next = await resolveConnection({
        ...candidate,
        endpoint: normalizeEndpoint(candidate.endpoint),
      });
      const repository = createRepository(next);
      const [capabilities, health] = await Promise.all([
        connectionCapabilities(repository, next.endpoint),
        // Older services have no readiness field; an unreadable health is not a failure here.
        Promise.resolve()
          .then(() => repository.serviceHealth())
          .catch(() => undefined),
      ]);
      if (!capabilities.gact_versions.includes(PROTOCOL_VERSION)) {
        throw new Error(
          `This workspace requires ${PROTOCOL.gact} ${PROTOCOL_VERSION}; the service offers ${capabilities.gact_versions.join(', ') || `no ${PROTOCOL.gact} versions`}.`,
        );
      }
      if (health?.readiness === 'starting') {
        // Reading workspaces now only earns a 503; wait for readiness (#739 B1).
        throw new TransportError('The service is still starting.', 503, 'task_runtime_starting', {
          readiness: 'starting',
          ...(health.starting ? { starting: health.starting } : {}),
        });
      }
      const rememberedRoute = lastWorkspaceRoute(next.endpoint);
      const [workspaces, sessions] = await Promise.all([
        repository.workspaces(),
        connectionCandidateSessions(repository, rememberedRoute),
      ]);
      const target = connectionSessionTargetForRoute(rememberedRoute, workspaces, sessions);
      const recent = latestConnectionSessionTarget(workspaces, sessions);
      const workspace =
        connectionWorkspaceForRoute(rememberedRoute, workspaces) ??
        recent?.workspace ??
        workspaces[0];
      await connect(next);
      queryClient.setQueryData(queryKeys.key('capabilities', next.endpoint), capabilities);
      queryClient.setQueryData(queryKeys.key('workspaces', next.endpoint), workspaces);
      // Opening a service must never persist an unused conversation. Defer the
      // route transition while search is open, including an in-flight startup.
      const route = target
        ? connectionSessionRoute(target)
        : workspace
          ? newConversationRoute(workspace.id)
          : undefined;
      if (!route) {
        reportConnectionOutcome({
          code: 'target_unresolved',
          endpoint: next.endpoint,
          reason: 'The service exposed no workspace that could be opened.',
        });
      }
      return { next, capabilities, sessions, target: target ?? workspace, workspaces, route };
    },
  });
  const setup = useMutation({
    mutationFn: async (input: {
      workspaceId?: string;
      workspaceName?: string;
      rootPath?: string;
      sessionTitle: string;
    }) => {
      if (!mutation.data) throw new Error('Connect to the service first.');
      const repository = createRepository(mutation.data.next);
      const workspaceId =
        input.workspaceId ??
        (
          await repository.createWorkspace({
            name: input.workspaceName ?? 'My workspace',
            root_path: input.rootPath ?? '',
          })
        ).id;
      const session = await repository.createSession({
        workspace_id: workspaceId,
        title: input.sessionTitle,
      });
      return { session, workspaceId };
    },
    onSuccess: ({ session, workspaceId }) => {
      if (mutation.data) {
        rememberWorkspaceRoute(mutation.data.next.endpoint, workspaceId, session.id);
      }
      navigate(
        `/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(session.id)}`,
      );
    },
  });

  const waiting = useConnectionWaiting(mutation, knownConnections);
  const resolvedRoute = mutation.data?.route;
  useEffect(() => {
    if (resolvedRoute && !searchOpen) navigate(resolvedRoute, { replace: true });
  }, [navigate, resolvedRoute, searchOpen]);

  useEffect(() => {
    if (
      autoConnectStarted.current ||
      searchOpen ||
      !credentialsReady ||
      (recents.length === 0 && !managedConnectionReady && !servedProbe.answered) ||
      connectionIntent === 'connect'
    )
      return;
    autoConnectStarted.current = true;
    setAutoConnectDispatched(true);
    mutation.mutate(
      recents.length === 0 && !managedConnectionReady && servedAgent
        ? { endpoint: servedAgent }
        : settings,
    );
  }, [
    connectionIntent,
    searchOpen,
    credentialsReady,
    managedConnectionReady,
    mutation,
    recents.length,
    servedAgent,
    servedProbe.answered,
    settings,
    settings.endpoint,
  ]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const candidate: ConnectionSettings =
      !showManualForm && selectedConnection
        ? {
            endpoint: selectedConnection.endpoint,
            token: selectedConnection.token,
            label: selectedConnection.label,
            location: selectedConnection.location,
            infrastructure: selectedConnection.infrastructure,
          }
        : {
            endpoint: endpointDraft,
            token: token || undefined,
            label: serviceNameDraft.trim() || undefined,
          };
    mutation.mutate(candidate);
  };

  if (waitingForManagedService) {
    return <DesktopBoot stage={managedBootStage(managedBackendStatus)} />;
  }

  if (
    shouldConnectAutomatically &&
    // `mutation.status === 'idle'` alone used to gate this, to cover the one
    // render between mount and the auto-connect effect actually dispatching
    // (avoiding a flash of the form first). But `mutation.reset()` ALSO
    // returns status to 'idle' -- "Add a service" and "Known services" call
    // it to clear a stale error/success from a previous attempt -- which
    // made this full-screen boot screen come BACK after the one-shot
    // auto-connect (gated by `autoConnectStarted`, see the effect above) had
    // already settled and would never fire again: the person clicked "Add a
    // service" and landed on a screen that could never finish "opening".
    // Once auto-connect has been dispatched at all, 'idle' no longer means
    // "about to auto-connect" -- only `isPending` (a real attempt in
    // flight) does.
    (!credentialsReady ||
      (!autoConnectDispatched && mutation.status === 'idle') ||
      mutation.isPending ||
      // Hysteresis (#739 B1): a service still starting fails the attempt between
      // retries, and a resolved attempt renders once before navigating. Neither may
      // flash the form in between.
      (autoConnectDispatched && waiting.retrying) ||
      (Boolean(resolvedRoute) && !searchOpen))
  ) {
    return (
      <DesktopBoot
        detail={waiting.availability?.starting ? waiting.availability.detail : undefined}
        stage="opening_workspace"
      />
    );
  }

  const knownMode = !showManualForm;
  const emptyService = mutation.isSuccess && !mutation.data.target;
  const canCancelManual = showManualForm && knownConnections.length > 0;
  const backToKnown = () => {
    setManualModeRequested(false);
    mutation.reset();
  };
  const submitLabel = mutation.isPending
    ? 'Connecting…'
    : showManualForm
      ? 'Connect'
      : 'Open workspace';

  return (
    <main className="relative h-full min-h-0 overflow-y-auto bg-background text-foreground">
      <div className="absolute top-3 right-3">
        <HomeSearchButton />
      </div>
      <div className="mx-auto flex min-h-full w-full max-w-[492px] flex-col justify-center gap-4 px-4 py-14">
        <p className="flex items-center gap-2 font-heading text-[15px] font-semibold">
          <BrandIcon className="size-[22px] shrink-0 text-primary" />
          {brand.name}
        </p>
        <ConnectFrame
          closeLabel="Back to known services"
          footer={
            emptyService ? undefined : (
              <>
                {inTauri() ? (
                  <Button
                    className={buttonClass}
                    onClick={() => setDeployOpen(true)}
                    type="button"
                    variant="ghost"
                  >
                    <ServerIcon aria-hidden="true" /> Deploy {vocab.agent}
                  </Button>
                ) : null}
                <span className="flex-1" />
                {canCancelManual ? (
                  <Button
                    className={buttonClass}
                    onClick={backToKnown}
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                ) : null}
                <Button
                  aria-keyshortcuts="Control+Enter Meta+Enter"
                  className={buttonClass}
                  disabled={mutation.isPending || (knownMode && !selectedConnection)}
                  form="connect-form"
                  type="submit"
                >
                  {submitLabel}
                  <span aria-hidden="true">
                    <ShortcutKeys
                      className="font-mono text-[10.5px] text-current opacity-70"
                      keys={['Ctrl+Enter']}
                    />
                  </span>
                </Button>
              </>
            )
          }
          icon={showManualForm ? <GlobeIcon /> : <ServerIcon />}
          onClose={canCancelManual ? backToKnown : undefined}
          title={
            emptyService
              ? `Open ${brand.name}`
              : showManualForm
                ? 'Connect by address'
                : 'Choose a service'
          }
        >
          {inTauri() ? (
            <DeployClioDialog
              knownServices={knownConnections}
              onOpenChange={setDeployOpen}
              onReady={(candidate) => mutation.mutateAsync(candidate).then(() => undefined)}
              open={deployOpen}
            />
          ) : null}
          {emptyService ? (
            <ConnectionEmptyService
              error={setup.error?.message}
              onCreate={(input) => setup.mutateAsync(input).then(() => undefined)}
              pending={setup.isPending}
              workspaces={mutation.data.workspaces}
            />
          ) : (
            <form
              className="flex min-w-0 flex-col gap-[13px]"
              id="connect-form"
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
                event.preventDefault();
                event.currentTarget.requestSubmit();
              }}
              onSubmit={submit}
            >
              {knownMode ? (
                <div
                  className="-mx-2 flex min-w-0 flex-col"
                  role="group"
                  aria-label="Known services"
                >
                  {knownConnections.map((connection) => {
                    const selected = connection.endpoint === selectedEndpoint;
                    const Icon = connectionSourceIcon(connection.source);
                    const host = new URL(connection.endpoint).host;
                    const name = connection.label || host;
                    return (
                      <ListRow
                        columns={
                          <span className="flex w-[104px] shrink-0 justify-end">
                            <ConnectionAvailabilityIndicator
                              availability={availabilityAfterAttempt(connection, mutation)}
                              compact
                              endpoint={connection.endpoint}
                            />
                          </span>
                        }
                        description={
                          connection.location ||
                          (connection.label ? connection.endpoint : undefined)
                        }
                        icon={<Icon />}
                        key={connection.endpoint}
                        layout="stacked"
                        primaryAction={
                          <span className="relative z-10">
                            <KnownServiceActions
                              canForget={connection.source !== 'managed'}
                              known={knownConnections}
                              name={name}
                              onForget={() => {
                                const next = knownConnections.find(
                                  (candidate) => candidate.endpoint !== connection.endpoint,
                                );
                                void forget(connection.endpoint);
                                if (selectedEndpoint === connection.endpoint) {
                                  if (next) setSelectedEndpoint(next.endpoint);
                                  else setManualModeRequested(true);
                                }
                              }}
                              onRename={(label) => rename(connection, label)}
                              service={connection}
                            />
                          </span>
                        }
                        selected={selected}
                        title={
                          <button
                            aria-pressed={selected}
                            className="text-left outline-none after:absolute after:inset-0 after:rounded-[6px] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                            onClick={() => setSelectedEndpoint(connection.endpoint)}
                            type="button"
                          >
                            {name}
                          </button>
                        }
                      />
                    );
                  })}
                  <SavedHostsCheck />
                  <button
                    className="flex min-h-[30px] items-center gap-2.5 rounded-[6px] px-2 text-left text-[12.5px] text-accent-foreground outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
                    onClick={() => {
                      setManualModeRequested(true);
                      setEndpointDraft(defaultEndpoint());
                      setServiceNameDraft('');
                      setToken('');
                      mutation.reset();
                    }}
                    type="button"
                  >
                    <AddIcon aria-hidden="true" className="size-4" />
                    Add a service
                  </button>
                </div>
              ) : (
                <ConnectAddressFields
                  endpoint={endpointDraft}
                  name={serviceNameDraft}
                  onEndpointChange={setEndpointDraft}
                  onNameChange={setServiceNameDraft}
                  onTokenChange={setToken}
                  token={token}
                />
              )}

              {mutation.error && waiting.waiting ? (
                <ConnectionWaitingNotice availability={waiting.availability} />
              ) : null}
              {mutation.error && !waiting.waiting ? (
                <ConnectErrorLine
                  error={mutation.error}
                  onRetry={
                    mutation.variables ? () => mutation.mutate(mutation.variables) : undefined
                  }
                  recovery={
                    mutation.error instanceof InfrastructureTargetGoneError &&
                    mutation.variables ? (
                      <Button
                        className="h-6 px-2 text-[11.5px]"
                        onClick={() => {
                          const goneEndpoint = mutation.variables.endpoint;
                          void forget(goneEndpoint);
                          mutation.reset();
                          setManualModeRequested(false);
                          setSelectedEndpoint((current) =>
                            current === goneEndpoint ? defaultEndpoint() : current,
                          );
                          setDeployOpen(true);
                        }}
                        type="button"
                        variant="outline"
                      >
                        Remove it and deploy {vocab.agent} again
                      </Button>
                    ) : undefined
                  }
                  title="Can't connect"
                />
              ) : null}
              {!mutation.error && credentialError ? (
                <ConnectErrorLine
                  error={new Error(credentialError)}
                  title={
                    managedBackendStatus?.kind === 'auth_unavailable'
                      ? `Can't sign in to the running ${vocab.agent}`
                      : `Local ${vocab.agent} could not start`
                  }
                />
              ) : null}
            </form>
          )}
        </ConnectFrame>
      </div>
    </main>
  );
}

const buttonClass = 'h-[30px] rounded-[6px] px-3 text-[12.5px] font-medium';
