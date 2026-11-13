import { BrandIcon } from '@/components/clio/brand-icon';
import { brand } from '@brand';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GlobeIcon,
  LaptopIcon,
  ServerIcon,
  TerminalSquareIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { AddIcon, CloseIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConnectionAvailabilityIndicator } from '@/components/clio/connection-availability';
import { DesktopBoot } from '@/components/clio/desktop-boot';
import { managedBootStage } from '@/lib/desktop-boot-stage';
import { ConnectFrame } from '@/components/clio/connect-frame';
import { ConnectAddressFields, ConnectErrorLine } from '@/components/clio/connect-address';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListRow } from '@/components/clio/primitives/list-row';
import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { useKeysAria } from '@/lib/shortcuts/hooks';
import { ConnectionWaitingNotice } from '@/components/clio/connection-attempt';
import {
  attemptErrorFor,
  availabilityAfterAttempt,
  availabilityFailed,
  knownServiceFailure,
  noAnswer,
  useConnectionWaiting,
  useServedEndpointProbe,
} from '@/lib/connection-attempt';
import { assertServiceOpenable } from '@/lib/service-open-gate';
import { ConnectionEmptyService } from '@/components/clio/connection-empty-service';
import { DeployClioDialog } from '@/components/clio/deploy-clio-dialog';
import { agentAvailabilityLabel, agentIdentity } from '@/components/clio/connection-names';
import { KnownServiceActions } from '@/components/clio/known-service-actions';
import { SavedHostsCheck } from '@/components/clio/saved-hosts-check';
import { queryKeys } from '@/lib/query-keys';
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
import { vocab } from '@/lib/brand-vocabulary';
import {
  lastWorkspaceRoute,
  rememberWorkspaceRoute,
  newConversationRoute,
} from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useCommandMenuVisibility } from '@/store/command-menu-visibility';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { historyIndex, settingsCloseStep } from '@/lib/settings-window-route';
import { DIALOG_FULL_WINDOW_LAYOUT } from '@/lib/dialog-sheet';
import { cn } from '@/lib/utils';
import { t, ph } from '@lingui/core/macro';

const { agent } = vocab;

/** The spec's row glyphs: this computer, a CLIO reached over SSH, or a service by address. */
function connectionSourceIcon(connection: KnownConnection) {
  if (connection.source === 'managed' || connection.infrastructure?.targetId === 'local') {
    return LaptopIcon;
  }
  if (connection.infrastructure) return TerminalSquareIcon;
  return ServerIcon;
}

function sameEndpoint(left: string, right: string): boolean {
  try {
    return normalizeEndpoint(left) === normalizeEndpoint(right);
  } catch {
    return left === right;
  }
}

/** A stopped attempt must not open the agent it was connecting to. */
class ConnectStopped extends Error {}

function knownCandidate(connection: KnownConnection): ConnectionSettings {
  return {
    endpoint: connection.endpoint,
    token: connection.token,
    label: connection.label,
    location: connection.location,
    infrastructure: connection.infrastructure,
  };
}

export function ConnectionPage({ dialog }: { dialog?: { onClose: () => void } } = {}) {
  const searchOpen = useCommandMenuVisibility((state) => state.open);
  const submitAria = useKeysAria(SUBMIT_KEYS);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    settings,
    recents,
    credentialsReady,
    managedConnection,
    managedConnectionReady,
    managedBackendStatus,
    managedInstallProgress,
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
  // (an explicit "Add an agent…" click) or because there is nothing known
  // yet to list at all — CLIO is for non-technical people, and ip:port is
  // the non-default way in.
  const knownConnections = useKnownConnections();
  const initialKnownConnection =
    knownConnections.find((connection) => connection.endpoint === settings.endpoint) ??
    knownConnections[0];
  const requestedMode = searchParams.get('mode');
  const [manualModeRequested, setManualModeRequested] = useState(requestedMode === 'address');
  const [selectedEndpoint, setSelectedEndpoint] = useState(
    initialKnownConnection?.endpoint ?? settings.endpoint,
  );
  // Empty, under the example placeholder: the page's own origin or a default
  // port is not an address the person chose (spec connect-infrastructure 04).
  const [endpointDraft, setEndpointDraft] = useState('');
  const [serviceNameDraft, setServiceNameDraft] = useState('');
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
  const autoConnectTarget = useMemo<ConnectionSettings>(
    () =>
      recents.length === 0 && !managedConnectionReady && servedAgent
        ? { endpoint: servedAgent }
        : settings,
    [managedConnectionReady, recents.length, servedAgent, settings],
  );
  // Bumped by "Stop connecting"; an attempt from an older generation never opens.
  const attemptGeneration = useRef(0);

  const mutation = useMutation({
    mutationFn: async (candidate: ConnectionSettings) => {
      const generation = attemptGeneration.current;
      const next = await resolveConnection({
        ...candidate,
        endpoint: normalizeEndpoint(candidate.endpoint),
      });
      const repository = createRepository(next);
      const capabilities = await assertServiceOpenable(repository, next.endpoint);
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
      if (generation !== attemptGeneration.current) throw new ConnectStopped();
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
      if (!mutation.data) throw new Error(t`Connect to the service first.`);
      const repository = createRepository(mutation.data.next);
      const workspaceId =
        input.workspaceId ??
        (
          await repository.createWorkspace({
            name: input.workspaceName ?? t`My workspace`,
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
    mutation.mutate(autoConnectTarget);
  }, [
    autoConnectTarget,
    connectionIntent,
    searchOpen,
    credentialsReady,
    managedConnectionReady,
    mutation,
    recents.length,
    servedProbe.answered,
  ]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const candidate: ConnectionSettings =
      !showManualForm && selectedConnection
        ? knownCandidate(selectedConnection)
        : {
            endpoint: endpointDraft,
            token: token || undefined,
            label: serviceNameDraft.trim() || undefined,
          };
    mutation.mutate(candidate);
  };

  if (waitingForManagedService) {
    return (
      <DesktopBoot
        install={managedInstallProgress}
        stage={managedBootStage(managedBackendStatus)}
      />
    );
  }

  const bootHold =
    shouldConnectAutomatically &&
    // `mutation.status === 'idle'` alone used to gate this, to cover the one
    // render between mount and the auto-connect effect actually dispatching
    // (avoiding a flash of the form first). But `mutation.reset()` ALSO
    // returns status to 'idle' -- "Add an agent…" and its Cancel call
    // it to clear a stale error/success from a previous attempt -- which
    // made the boot hold come BACK after the one-shot auto-connect (gated by
    // `autoConnectStarted`, see the effect above) had already settled and
    // would never fire again. Once auto-connect has been dispatched at all,
    // 'idle' no longer means "about to auto-connect" -- only `isPending` (a
    // real attempt in flight) does.
    (!credentialsReady ||
      (!autoConnectDispatched && mutation.status === 'idle') ||
      mutation.isPending ||
      // Hysteresis (#739 B1): a service still starting fails the attempt between
      // retries, and a resolved attempt renders once before navigating. Neither may
      // flash the form in between.
      (autoConnectDispatched && waiting.retrying) ||
      (Boolean(resolvedRoute) && !searchOpen));
  const attemptEndpoint = mutation.variables?.endpoint ?? autoConnectTarget.endpoint;
  // Only the desktop's own agent starts on this computer; anything else is reached, not started.
  const attemptIsLocal =
    !credentialsReady ||
    (managedConnection !== undefined && sameEndpoint(attemptEndpoint, managedConnection.endpoint));
  if (bootHold && attemptIsLocal) {
    return (
      <DesktopBoot
        detail={waiting.availability?.starting ? waiting.availability.detail : undefined}
        stage="opening_workspace"
      />
    );
  }

  // Connecting to an agent elsewhere shows its progress in that agent's row (spec
  // connect-infrastructure "Connecting"): one line, one action.
  const connectingEndpoint =
    mutation.isPending || waiting.retrying || (Boolean(resolvedRoute) && !searchOpen)
      ? mutation.variables?.endpoint
      : bootHold
        ? autoConnectTarget.endpoint
        : undefined;
  const connectingKnown =
    connectingEndpoint === undefined
      ? undefined
      : knownConnections.find((connection) =>
          sameEndpoint(connection.endpoint, connectingEndpoint),
        );
  // An agent-served page with nothing remembered is connecting to its own origin.
  const connectingRow: KnownConnection | undefined =
    connectingEndpoint !== undefined && connectingKnown === undefined && !manualModeRequested
      ? {
          endpoint: connectingEndpoint,
          label: mutation.variables?.label,
          source: 'recent',
          availability: { state: 'checking', label: t`Connecting`, detail: t`Connecting…` },
        }
      : undefined;
  const rows = connectingRow ? [connectingRow, ...knownConnections] : knownConnections;
  const showManualForm = manualModeRequested || rows.length === 0;
  const isConnectingRow = (connection: KnownConnection) =>
    connectingEndpoint !== undefined && sameEndpoint(connection.endpoint, connectingEndpoint);
  const stopConnecting = () => {
    attemptGeneration.current += 1;
    autoConnectStarted.current = true;
    setAutoConnectDispatched(true);
    mutation.reset();
  };

  const knownMode = !showManualForm;
  const connectingInRow = knownMode && connectingEndpoint !== undefined;
  const emptyService = mutation.isSuccess && !mutation.data.target;
  const canCancelManual = showManualForm && knownConnections.length > 0;
  const backToKnown = () => {
    setManualModeRequested(false);
    mutation.reset();
  };
  // Over the app, × and Esc close the dialog. Cancel returns to the list only when
  // the list led to the form; opened as Connect by address, it closes too.
  const cancelManual = dialog && requestedMode === 'address' ? dialog.onClose : backToKnown;
  const showCancel = canCancelManual || (dialog !== undefined && showManualForm);
  // In the list, progress shows only in the connecting row; the manual form has no row.
  const submitLabel = showManualForm
    ? mutation.isPending
      ? t`Connecting…`
      : t({ message: 'Connect', context: 'verb' })
    : t`Open workspace`;
  // A known service that does not answer cannot be opened; its row says so and offers Retry.
  const selectedFailed =
    knownMode &&
    selectedConnection !== undefined &&
    availabilityFailed(availabilityAfterAttempt(selectedConnection, mutation));
  // The row already carries "no answer from …", so the form does not repeat it.
  const errorShownInRow =
    selectedFailed &&
    selectedConnection !== undefined &&
    noAnswer(attemptErrorFor(selectedConnection, mutation));
  // One persistent polite region carries connection progress; regions inserted
  // together with their text are not reliably announced.
  const connectingConnection = connectingInRow ? rows.find(isConnectingRow) : undefined;
  const progressAnnouncement = connectingConnection
    ? connectingConnection.availability.starting
      ? connectingConnection.availability.detail
      : t`Connecting to ${ph({
          name: agentIdentity(
            connectingConnection.endpoint,
            connectingConnection.label,
            connectingConnection.location,
          ).name,
        })}`
    : showManualForm && mutation.isPending
      ? t`Connecting to ${ph({ name: mutation.variables?.endpoint ?? agent })}`
      : mutation.error && waiting.waiting
        ? t`Waiting for the service to start`
        : '';
  const retryKnown = (connection: KnownConnection) => {
    setSelectedEndpoint(connection.endpoint);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.key('connection-availability', connection.endpoint),
    });
    mutation.mutate(knownCandidate(connection));
  };

  const closeLabel = dialog ? t`Close` : t`Back to the agent list`;
  const frame = (
    <ConnectFrame
      className={
        dialog
          ? 'max-h-[calc(100dvh-2rem)] w-full overflow-y-auto max-[599px]:max-h-none'
          : undefined
      }
      closeLabel={closeLabel}
      dialog={dialog !== undefined}
      narrow="window"
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
                <ServerIcon aria-hidden="true" /> {t`Deploy ${agent}`}
              </Button>
            ) : null}
            <span className="flex-1" />
            {showCancel ? (
              <Button className={buttonClass} onClick={cancelManual} type="button" variant="ghost">
                {t`Cancel`}
              </Button>
            ) : null}
            <Button
              aria-keyshortcuts={submitAria}
              className={cn(buttonClass, 'bg-clip-border')}
              disabled={
                mutation.isPending ||
                connectingInRow ||
                (knownMode && !selectedConnection) ||
                selectedFailed
              }
              form="connect-form"
              type="submit"
            >
              {submitLabel}
              {/* The sheet under 600 px drops key hints first. */}
              <span aria-hidden="true" className="inline-flex max-[599px]:hidden">
                <ShortcutKeys className="border-current/45" keys={SUBMIT_KEYS} variant="inline" />
              </span>
            </Button>
          </>
        )
      }
      icon={showManualForm ? <GlobeIcon /> : <ServerIcon />}
      onClose={dialog ? dialog.onClose : canCancelManual ? backToKnown : undefined}
      title={
        emptyService
          ? t`Open ${ph({ name: brand.name })}`
          : showManualForm
            ? t`Connect by address`
            : t`Switch to`
      }
    >
      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {progressAnnouncement}
      </p>
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
            <div className="-mx-2 flex min-w-0 flex-col" role="group" aria-label={t`Switch to`}>
              {rows.map((connection) => {
                const selected = connection.endpoint === selectedEndpoint;
                const Icon = connectionSourceIcon(connection);
                // The CLIO menu's identity: the name leads; the address is secondary.
                const identity = agentIdentity(
                  connection.endpoint,
                  connection.label,
                  connection.location,
                );
                const name = identity.name;
                const connecting = isConnectingRow(connection);
                const availability = availabilityAfterAttempt(connection, mutation);
                const failed = !connecting && availabilityFailed(availability);
                const connectingDetail = connection.availability.starting
                  ? connection.availability.detail
                  : t`Connecting…`;
                return (
                  <ListRow
                    className="min-h-[30px]"
                    columns={
                      <span className="flex w-[104px] shrink-0 justify-end">
                        {connecting ? null : failed ? (
                          <IconButton
                            className="z-10"
                            disabled={mutation.isPending}
                            icon={<RetryIcon aria-hidden="true" />}
                            label={t`Retry`}
                            onClick={() => retryKnown(connection)}
                            size="sm"
                            type="button"
                          />
                        ) : (
                          <ConnectionAvailabilityIndicator
                            availability={{
                              ...availability,
                              label: agentAvailabilityLabel(
                                availability,
                                connection.endpoint === settings.endpoint,
                              ),
                            }}
                            compact
                            endpoint={connection.endpoint}
                          />
                        )}
                      </span>
                    }
                    description={
                      connecting ? (
                        <span
                          className="inline-flex max-w-full min-w-0 items-center gap-1.5"
                          title={connectingDetail}
                        >
                          <span
                            aria-hidden="true"
                            className="block size-[9px] shrink-0 rounded-full border-[1.5px] border-primary border-t-transparent motion-safe:animate-spin"
                          />
                          <span className="min-w-0 truncate">{connectingDetail}</span>
                        </span>
                      ) : failed ? (
                        <span
                          className="inline-flex max-w-full min-w-0 items-center gap-1 text-destructive-foreground"
                          title={
                            availability.diagnostics
                              ? `${availability.detail}\n\n${availability.diagnostics}`
                              : availability.detail
                          }
                        >
                          <TriangleAlertIcon
                            aria-hidden="true"
                            className="size-3 shrink-0 text-destructive"
                          />
                          <span className="min-w-0 truncate">
                            {knownServiceFailure(connection, availability, mutation)}
                          </span>
                        </span>
                      ) : (
                        identity.address
                      )
                    }
                    icon={<Icon />}
                    key={connection.endpoint}
                    layout="stacked"
                    primaryAction={
                      connecting ? (
                        <span className="relative z-10">
                          <IconButton
                            icon={<CloseIcon aria-hidden="true" />}
                            label={t`Stop connecting`}
                            onClick={stopConnecting}
                            size="sm"
                            type="button"
                          />
                        </span>
                      ) : (
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
                      )
                    }
                    selected={selected}
                    selectedTone="accent"
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
                className="flex min-h-[30px] items-center gap-2.5 rounded-[6px] px-2 text-left text-menu text-accent-foreground outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
                onClick={() => {
                  attemptGeneration.current += 1;
                  setManualModeRequested(true);
                  setEndpointDraft('');
                  setServiceNameDraft('');
                  setToken('');
                  mutation.reset();
                }}
                type="button"
              >
                <AddIcon aria-hidden="true" className="size-4" />
                {t`Add an agent…`}
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

          {mutation.error && waiting.waiting && !connectingInRow ? (
            <ConnectionWaitingNotice availability={waiting.availability} />
          ) : null}
          {mutation.error && !waiting.waiting && !errorShownInRow && !connectingInRow ? (
            <ConnectErrorLine
              error={mutation.error}
              onRetry={mutation.variables ? () => mutation.mutate(mutation.variables) : undefined}
              recovery={
                mutation.error instanceof InfrastructureTargetGoneError && mutation.variables ? (
                  <Button
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
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    {t`Remove and redeploy`}
                  </Button>
                ) : undefined
              }
              // A failed row already reads "Can't connect"; the line adds only the reason.
              title={selectedFailed ? undefined : t`Can't connect`}
              tokenSent={Boolean(mutation.variables?.token)}
            />
          ) : null}
          {!mutation.error && credentialError ? (
            <ConnectErrorLine
              error={new Error(credentialError)}
              title={
                managedBackendStatus?.kind === 'auth_unavailable'
                  ? t`Can't sign in to the running ${agent}`
                  : t`Local ${agent} could not start`
              }
            />
          ) : null}
        </form>
      )}
    </ConnectFrame>
  );

  if (dialog) {
    return (
      <Dialog open onOpenChange={(open) => (open ? undefined : dialog.onClose())}>
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            'top-1/2 w-[clamp(340px,36vw,640px)] max-w-[calc(100%-2rem)] -translate-y-1/2 gap-0 overflow-visible rounded-[12px] bg-transparent p-0 ring-0 sm:max-w-[calc(100%-2rem)]',
            // Spec connect-infrastructure "Dialogs … Under 600 px, full window".
            DIALOG_FULL_WINDOW_LAYOUT,
          )}
          showCloseButton={false}
          // Start in the content (the address field or the first agent), not on
          // the close button, so Esc closes the dialog on the first press.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const content = event.currentTarget as HTMLElement;
            const first = [
              ...content.querySelectorAll<HTMLElement>('input, button, [tabindex="0"]'),
            ].find((element) => element.getAttribute('aria-label') !== closeLabel);
            first?.focus();
          }}
        >
          {frame}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <main className="relative h-full min-h-0 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-[492px] flex-col justify-center gap-4 px-4 py-14">
        <p className="flex items-center gap-2 font-heading text-h3 font-semibold">
          <BrandIcon className="size-[22px] shrink-0 text-primary" />
          {brand.name}
        </p>
        {frame}
      </div>
    </main>
  );
}

/**
 * Connect by address, Manage agents and the other in-app ways in, as a dialog
 * over the page they were opened from. Closing returns to that page.
 */
export function ConnectionDialog({ background }: { background: string }) {
  const navigate = useNavigate();
  const [openedAt] = useState(historyIndex);
  const close = () => {
    const step = settingsCloseStep(openedAt, historyIndex());
    if (step !== undefined) void navigate(step);
    else void navigate(background, { replace: true });
  };
  return <ConnectionPage dialog={{ onClose: close }} />;
}

const buttonClass = 'h-[30px] rounded-[6px] px-3 text-menu font-medium';
const SUBMIT_KEYS = ['Ctrl+Enter'] as const;
