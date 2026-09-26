import { brand } from '@brand';
import { PROTOCOL_VERSION } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BrainCircuitIcon,
  ChartNoAxesCombinedIcon,
  CheckIcon,
  FolderClockIcon,
  KeyRoundIcon,
  LaptopIcon,
  PlusIcon,
  ShieldCheckIcon,
  ServerIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConnectionAvailabilityIndicator } from '@/components/clio/connection-availability';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { ClioStatus } from '@/components/clio/status';
import { ConnectionEmptyService } from '@/components/clio/connection-empty-service';
import { DeployClioDialog } from '@/components/clio/deploy-clio-dialog';
import { KnownServiceActions } from '@/components/clio/known-service-actions';
import { reportConnectionOutcome } from '@/lib/connection-outcomes';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useKnownConnections, type KnownConnection } from '@/hooks/use-known-connections';
import type { ConnectionAvailability } from '@/hooks/use-connection-availability';
import {
  createRepository,
  DEFAULT_ENDPOINT,
  normalizeEndpoint,
  type ConnectionSettings,
} from '@/lib/connection';
import {
  connectionSessionRoute,
  connectionWorkspaceForRoute,
  emptyConnectionSessionTarget,
  latestConnectionSessionTarget,
} from '@/lib/connection-target';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { PROTOCOL, vocab } from '@/lib/brand-vocabulary';
import { lastWorkspaceRoute, rememberWorkspaceRoute } from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { ManagedBackendStatus } from '@/tauri/managed-backend';

type DesktopBootStage =
  | 'checking_existing'
  | 'starting_service'
  | 'installing_runtime'
  | 'opening_workspace';

const desktopBootCopy: Record<DesktopBootStage, { detail: string; label: string }> = {
  checking_existing: {
    label: 'Checking this device',
    detail: `Looking for a local ${vocab.agent} service`,
  },
  starting_service: {
    label: 'Starting local service',
    detail: 'Loading the bundled scientific workspace',
  },
  installing_runtime: {
    label: 'Installing local runtime',
    detail: `Preparing ${vocab.agent} for first use`,
  },
  opening_workspace: {
    label: 'Opening workspace',
    detail: 'Restoring your local workspace',
  },
};

/** One icon per known-connection source, so the list reads at a glance without a legend. */
function connectionSourceIcon(source: KnownConnection['source']) {
  if (source === 'managed') return LaptopIcon;
  if (source === 'infrastructure') return ServerIcon;
  return FolderClockIcon;
}

/**
 * A row's badge normally reflects the independent background probe
 * (`useConnectionAvailabilities`, retried on its own schedule). But a real
 * connect attempt against that SAME endpoint already produced a definitive
 * answer -- there is no honest reason to keep showing "Checking" on the row
 * while the alert right below it already says the service is unreachable.
 * Once a connect attempt to this endpoint has failed, that failure IS the
 * row's availability until something clears it (a new attempt, or the
 * background probe itself catching up and reporting the same thing).
 */
function withFailedAttemptAvailability(
  connection: KnownConnection,
  attempt: { isError: boolean; error: Error | null; variables?: ConnectionSettings },
): ConnectionAvailability {
  if (!attempt.isError || !attempt.variables) return connection.availability;
  let attemptedEndpoint: string;
  try {
    attemptedEndpoint = normalizeEndpoint(attempt.variables.endpoint);
  } catch {
    return connection.availability;
  }
  if (attemptedEndpoint !== connection.endpoint) return connection.availability;
  return {
    state: 'unavailable',
    label: 'Unavailable',
    detail: attempt.error?.message || 'The service could not be reached.',
  };
}

function managedBootStage(status?: ManagedBackendStatus): DesktopBootStage {
  if (status?.kind === 'needs_install') return 'installing_runtime';
  if (status?.kind === 'starting') return status.detail;
  return 'checking_existing';
}

function DesktopBoot({
  logoSource,
  stage,
}: {
  logoSource: string | null;
  stage: DesktopBootStage;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const copy = desktopBootCopy[stage];
  const activeStep = stage === 'checking_existing' ? 0 : stage === 'opening_workspace' ? 2 : 1;

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="relative grid h-full min-h-0 overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="clio-landing-background absolute inset-0 opacity-70" />
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 size-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-3xl"
      />
      <section className="relative grid place-items-center px-6 py-16 text-center">
        <div className="grid justify-items-center">
          <div className="relative grid size-56 place-items-center sm:size-64">
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-primary/15 shadow-[0_0_80px_color-mix(in_oklch,var(--primary)_15%,transparent)]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-7 rounded-full border border-primary/25"
            />
            <div className="relative grid size-36 place-items-center overflow-hidden rounded-[2.25rem] border border-primary/30 bg-card/45 p-4 shadow-2xl backdrop-blur-xl sm:size-40">
              {logoSource ? (
                <img
                  alt=""
                  className="size-full translate-x-1 -translate-y-2 object-contain"
                  data-testid="desktop-boot-logo"
                  src={logoSource}
                />
              ) : (
                <span className="font-heading text-6xl font-semibold text-primary">
                  {brand.markGlyph}
                </span>
              )}
            </div>
          </div>
          <Shimmer
            as="h1"
            className="mt-7 font-heading text-2xl font-semibold tracking-[-0.035em]"
            duration={1.7}
          >
            {`Starting ${brand.name}`}
          </Shimmer>
          <p className="mt-2 text-sm text-muted-foreground">
            Your local scientific workspace is getting ready.
          </p>
        </div>
      </section>

      <aside
        aria-live="polite"
        className="absolute bottom-6 right-6 w-[min(22rem,calc(100%-3rem))] rounded-2xl border border-border/80 bg-card/75 p-4 text-left shadow-xl backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Local startup
            </p>
            <p className="mt-1 truncate text-sm font-medium">{copy.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.detail}</p>
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {elapsedSeconds}s
          </span>
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Startup progress">
          {['Check', stage === 'installing_runtime' ? 'Install' : 'Start', 'Open'].map(
            (label, index) => (
              <li className="flex min-w-0 items-center gap-1.5 text-[11px]" key={label}>
                <span
                  className="grid size-4 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground data-[active=true]:border-primary data-[active=true]:text-primary data-[done=true]:border-emerald-500/50 data-[done=true]:bg-emerald-500/10 data-[done=true]:text-emerald-500"
                  data-active={index === activeStep}
                  data-done={index < activeStep}
                >
                  {index < activeStep ? (
                    <CheckIcon aria-hidden="true" className="size-2.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="truncate text-muted-foreground">{label}</span>
              </li>
            ),
          )}
        </ol>
      </aside>
    </main>
  );
}

export function ConnectionPage() {
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
  const [manualModeRequested, setManualModeRequested] = useState(false);
  const showManualForm = manualModeRequested || knownConnections.length === 0;
  const [selectedEndpoint, setSelectedEndpoint] = useState(
    initialKnownConnection?.endpoint ?? settings.endpoint,
  );
  const [endpointDraft, setEndpointDraft] = useState(
    initialKnownConnection ? DEFAULT_ENDPOINT : settings.endpoint,
  );
  const [serviceNameDraft, setServiceNameDraft] = useState(
    initialKnownConnection ? '' : (settings.label ?? ''),
  );
  const [token, setToken] = useState('');
  const [deployOpen, setDeployOpen] = useState(inTauri() && searchParams.get('mode') === 'deploy');
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
  const shouldConnectAutomatically =
    (recents.length > 0 || managedConnectionReady) && connectionIntent !== 'connect';
  const waitingForManagedService = inTauri() && !credentialsReady && connectionIntent !== 'connect';

  const mutation = useMutation({
    mutationFn: async (candidate: ConnectionSettings) => {
      const next = await resolveConnection({
        ...candidate,
        endpoint: normalizeEndpoint(candidate.endpoint),
      });
      const repository = createRepository(next);
      const capabilities = await repository.capabilities();
      if (!capabilities.gact_versions.includes(PROTOCOL_VERSION)) {
        throw new Error(
          `This workspace requires ${PROTOCOL.gact} ${PROTOCOL_VERSION}; the service offers ${capabilities.gact_versions.join(', ') || `no ${PROTOCOL.gact} versions`}.`,
        );
      }
      const [workspaces, sessions] = await Promise.all([
        repository.workspaces(),
        repository.allSessions(),
      ]);
      // Only the workspace is remembered here: the flow below opens a blank
      // conversation rather than the one that happened to be open last.
      const rememberedWorkspace = connectionWorkspaceForRoute(
        lastWorkspaceRoute(next.endpoint),
        workspaces,
      );
      const recent = latestConnectionSessionTarget(workspaces, sessions);
      const workspace = rememberedWorkspace ?? recent?.workspace ?? workspaces[0];
      let target = workspace ? emptyConnectionSessionTarget(workspace, sessions) : undefined;
      await connect(next);
      if (!target && workspace) {
        // Older services do not expose message_count. Fall back to their latest
        // valid session instead of manufacturing a blank conversation on every load.
        if (sessions.some((session) => session.message_count === undefined)) {
          target = recent;
        } else {
          const session = await repository.createSession({
            workspace_id: workspace.id,
            title: 'New conversation',
          });
          target = { workspace, session };
          reportConnectionOutcome({
            code: 'session_minted',
            endpoint: next.endpoint,
            reason:
              'Every existing conversation in this workspace had content, so a new one was created to land in.',
            sessionId: session.id,
            workspaceId: workspace.id,
          });
        }
      }
      if (!target) {
        // The connection itself succeeded — there is simply nothing openable on
        // the far side. The setup surface below is the way out of that; falling
        // back to the connect form would strand the person on a button that has
        // already done its job.
        reportConnectionOutcome({
          code: 'target_unresolved',
          endpoint: next.endpoint,
          reason: workspace
            ? 'The workspace held no conversation that could be opened.'
            : 'The service exposed no workspace that could be opened.',
          workspaceId: workspace?.id,
        });
      }
      if (target) {
        rememberWorkspaceRoute(next.endpoint, target.workspace.id, target.session.id);
        await navigate(connectionSessionRoute(target), { replace: true });
      }
      return { next, capabilities, sessions, target, workspaces };
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

  useEffect(() => {
    if (
      autoConnectStarted.current ||
      !credentialsReady ||
      (recents.length === 0 && !managedConnectionReady) ||
      connectionIntent === 'connect'
    )
      return;
    autoConnectStarted.current = true;
    setAutoConnectDispatched(true);
    mutation.mutate(settings);
  }, [
    connectionIntent,
    credentialsReady,
    managedConnectionReady,
    mutation,
    recents.length,
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

  const logoSource =
    brand.logoImage ??
    (brand.logoSvg ? `data:image/svg+xml,${encodeURIComponent(brand.logoSvg)}` : null);

  if (waitingForManagedService) {
    return <DesktopBoot logoSource={logoSource} stage={managedBootStage(managedBackendStatus)} />;
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
      mutation.isPending)
  ) {
    return <DesktopBoot logoSource={logoSource} stage="opening_workspace" />;
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground">
      <div aria-hidden="true" className="clio-landing-background absolute inset-0" />
      <section className="relative mx-auto grid min-h-full max-w-7xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:px-12">
        <div className="max-w-2xl">
          <div className="mb-10 flex items-center gap-4">
            <div className="grid size-14 place-items-center overflow-hidden rounded-2xl border border-primary/35 bg-card/75 shadow-[0_0_48px_color-mix(in_oklch,var(--primary)_18%,transparent)] backdrop-blur">
              {logoSource ? (
                <img alt="" className="size-full object-contain p-1.5" src={logoSource} />
              ) : (
                <span
                  aria-hidden="true"
                  className="font-heading text-xl font-semibold text-primary"
                >
                  {brand.markGlyph}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                {brand.landing.eyebrow}
              </p>
              <p className="font-heading text-2xl font-semibold tracking-[-0.025em]">
                {brand.wordmark}
              </p>
              {brand.tagline ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{brand.tagline}</p>
              ) : null}
            </div>
          </div>
          <h1 className="max-w-2xl text-balance font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-6xl">
            {brand.landing.headline}
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
            {brand.landing.description}
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              [ChartNoAxesCombinedIcon, 'Explore results', 'Plots, data, and evidence together'],
              [BrainCircuitIcon, 'Follow the work', 'Reasoning and tools in context'],
              [ShieldCheckIcon, 'Stay in control', 'Decisions and approvals remain visible'],
            ].map(([Icon, title, detail]) => (
              <div className="rounded-xl border bg-card/55 p-4 backdrop-blur" key={String(title)}>
                <Icon aria-hidden="true" className="mb-3 size-4 text-primary" />
                <p className="text-sm font-medium">{String(title)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{String(detail)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card/85 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="font-heading text-xl font-semibold">
                {showManualForm ? 'Add an agent service' : `Open ${brand.name}`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {showManualForm
                  ? 'Name the service and enter its address.'
                  : 'Choose a service to continue.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {inTauri() ? (
                <Button
                  onClick={() => setDeployOpen(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ServerIcon aria-hidden="true" /> Deploy {vocab.agent}
                </Button>
              ) : null}
              {mutation.isPending ? <ClioStatus value="connecting" /> : null}
            </div>
          </div>

          {inTauri() ? (
            <DeployClioDialog
              knownServices={knownConnections}
              onOpenChange={setDeployOpen}
              onReady={(candidate) => mutation.mutateAsync(candidate).then(() => undefined)}
              open={deployOpen}
            />
          ) : null}

          {mutation.isSuccess && !mutation.data.target ? (
            <ConnectionEmptyService
              error={setup.error?.message}
              onCreate={(input) => setup.mutateAsync(input).then(() => undefined)}
              pending={setup.isPending}
              workspaces={mutation.data.workspaces}
            />
          ) : (
            <form className="grid gap-5" onSubmit={submit}>
              {!showManualForm ? (
                <FieldSet>
                  <FieldLegend variant="label">Known services</FieldLegend>
                  <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
                    {knownConnections.map((connection) => {
                      const selected = connection.endpoint === selectedEndpoint;
                      const Icon = connectionSourceIcon(connection.source);
                      const availability = withFailedAttemptAvailability(connection, mutation);
                      return (
                        <div
                          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center overflow-hidden rounded-xl border bg-background transition-colors data-[selected=true]:border-primary/45 data-[selected=true]:bg-primary/5"
                          data-selected={selected}
                          key={connection.endpoint}
                        >
                          <button
                            aria-pressed={selected}
                            className="flex min-w-0 items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
                            onClick={() => setSelectedEndpoint(connection.endpoint)}
                            type="button"
                          >
                            <Icon aria-hidden="true" className="shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {connection.label || new URL(connection.endpoint).host}
                              </span>
                              <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                {connection.location || connection.endpoint}
                              </span>
                            </span>
                          </button>
                          <ConnectionAvailabilityIndicator
                            availability={availability}
                            compact
                            endpoint={connection.endpoint}
                          />
                          <KnownServiceActions
                            canForget={connection.source !== 'managed'}
                            known={knownConnections}
                            name={connection.label || new URL(connection.endpoint).host}
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
                            onRename={(name) => rename(connection, name)}
                            service={connection}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    className="justify-start"
                    onClick={() => {
                      setManualModeRequested(true);
                      setEndpointDraft(DEFAULT_ENDPOINT);
                      setServiceNameDraft('');
                      setToken('');
                      mutation.reset();
                    }}
                    type="button"
                    variant="outline"
                  >
                    <PlusIcon aria-hidden="true" data-icon="inline-start" /> Add a service
                  </Button>
                </FieldSet>
              ) : (
                <FieldGroup>
                  {knownConnections.length > 0 ? (
                    <Button
                      className="w-fit px-0"
                      onClick={() => {
                        setManualModeRequested(false);
                        mutation.reset();
                      }}
                      type="button"
                      variant="link"
                    >
                      <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" /> Known services
                    </Button>
                  ) : null}
                  <Field>
                    <FieldLabel htmlFor="service-name">Service name</FieldLabel>
                    <Input
                      autoComplete="off"
                      className="h-11"
                      id="service-name"
                      onChange={(event) => setServiceNameDraft(event.target.value)}
                      placeholder="For example, Homelab"
                      value={serviceNameDraft}
                    />
                    <FieldDescription>Shown in your service picker.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="endpoint">Connection address</FieldLabel>
                    <Input
                      autoComplete="url"
                      className="h-11 font-mono text-sm"
                      id="endpoint"
                      onChange={(event) => setEndpointDraft(event.target.value)}
                      placeholder={DEFAULT_ENDPOINT}
                      required
                      value={endpointDraft}
                    />
                  </Field>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button className="h-11 justify-between" type="button" variant="outline">
                        <span className="flex items-center gap-2">
                          <KeyRoundIcon aria-hidden="true" /> Access token
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {token ? 'Added' : 'Optional'}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 p-4">
                      <PopoverHeader>
                        <PopoverTitle>Access token</PopoverTitle>
                        <PopoverDescription>
                          {inTauri() ? 'Saved securely on this device.' : 'Kept in memory only.'}
                        </PopoverDescription>
                      </PopoverHeader>
                      <Field className="mt-2">
                        <FieldLabel className="sr-only" htmlFor="token">
                          Access token
                        </FieldLabel>
                        <Input
                          autoComplete="off"
                          className="h-10 font-mono"
                          id="token"
                          onChange={(event) => setToken(event.target.value)}
                          placeholder="Paste token"
                          type="password"
                          value={token}
                        />
                      </Field>
                    </PopoverContent>
                  </Popover>
                </FieldGroup>
              )}

              {mutation.error ? (
                <Alert variant="destructive">
                  <TriangleAlertIcon aria-hidden="true" />
                  <AlertTitle>Connection unavailable</AlertTitle>
                  <AlertDescription>{mutation.error.message}</AlertDescription>
                </Alert>
              ) : null}

              {!mutation.error && credentialError ? (
                <Alert variant="destructive">
                  <TriangleAlertIcon aria-hidden="true" />
                  <AlertTitle>Saved access token unavailable</AlertTitle>
                  <AlertDescription>{credentialError}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                className="h-11 justify-between bg-action text-white hover:bg-action/90"
                disabled={mutation.isPending || (!showManualForm && !selectedConnection)}
                type="submit"
              >
                <span>
                  {mutation.isPending
                    ? 'Connecting…'
                    : showManualForm
                      ? 'Connect'
                      : 'Open workspace'}
                </span>
                <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
