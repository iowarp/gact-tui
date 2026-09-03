import { brand } from '@brand';
import { PROTOCOL_VERSION } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BrainCircuitIcon,
  ChartNoAxesCombinedIcon,
  FolderClockIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConnectionAvailabilityIndicator } from '@/components/clio/connection-availability';
import { ClioStatus } from '@/components/clio/status';
import { ConnectionEmptyService } from '@/components/clio/connection-empty-service';
import { WorkspaceLoading } from '@/components/clio/workspace-route-surfaces';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  connectionAvailability,
  useConnectionAvailabilities,
} from '@/hooks/use-connection-availability';
import {
  createRepository,
  DEFAULT_ENDPOINT,
  normalizeEndpoint,
  type ConnectionSettings,
} from '@/lib/connection';
import {
  connectionSessionRoute,
  connectionSessionTargetForRoute,
  emptyConnectionSessionTarget,
  latestConnectionSessionTarget,
} from '@/lib/connection-target';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { lastWorkspaceRoute, rememberWorkspaceRoute } from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';

export function ConnectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    settings,
    recents,
    credentialsReady,
    managedConnectionReady,
    credentialError,
    resolveConnection,
    connect,
    forget,
  } = useConnectionSettings();
  const initialSavedConnection =
    recents.find((recent) => recent.endpoint === settings.endpoint) ?? recents[0];
  const [connectionMode, setConnectionMode] = useState<'saved' | 'new'>(() =>
    initialSavedConnection ? 'saved' : 'new',
  );
  const [selectedEndpoint, setSelectedEndpoint] = useState(
    initialSavedConnection?.endpoint ?? settings.endpoint,
  );
  const [endpointDraft, setEndpointDraft] = useState(
    initialSavedConnection ? DEFAULT_ENDPOINT : settings.endpoint,
  );
  const [serviceNameDraft, setServiceNameDraft] = useState(
    initialSavedConnection ? '' : (settings.label ?? ''),
  );
  const [token, setToken] = useState('');
  const selectedConnection = recents.find((recent) => recent.endpoint === selectedEndpoint);
  const availabilities = useConnectionAvailabilities(recents);
  const selectedAvailability = selectedConnection
    ? connectionAvailability(availabilities, selectedConnection.endpoint)
    : undefined;
  const autoConnectStarted = useRef(false);
  const connectionIntent = searchParams.get('intent');
  const shouldConnectAutomatically =
    (recents.length > 0 || managedConnectionReady) && connectionIntent !== 'connect';

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
          `This workspace requires GACT ${PROTOCOL_VERSION}; the service offers ${capabilities.gact_versions.join(', ') || 'no GACT versions'}.`,
        );
      }
      const [workspaces, sessions] = await Promise.all([
        repository.workspaces(),
        repository.allSessions(),
      ]);
      const remembered = connectionSessionTargetForRoute(
        lastWorkspaceRoute(next.endpoint),
        workspaces,
        sessions,
      );
      const recent = latestConnectionSessionTarget(workspaces, sessions);
      const workspace = remembered?.workspace ?? recent?.workspace ?? workspaces[0];
      let target = workspace ? emptyConnectionSessionTarget(workspace, sessions) : undefined;
      await connect(next);
      if (!target && workspace) {
        // Older services do not expose message_count. Fall back to their latest
        // valid session instead of manufacturing a blank conversation on every load.
        target = sessions.some((session) => session.message_count === undefined)
          ? recent
          : {
              workspace,
              session: await repository.createSession({
                workspace_id: workspace.id,
                title: 'New conversation',
              }),
            };
      }
      return { next, capabilities, sessions, target, workspaces };
    },
    onSuccess: ({ next, target }) => {
      if (!target) return;
      rememberWorkspaceRoute(next.endpoint, target.workspace.id, target.session.id);
      void navigate(connectionSessionRoute(target), { replace: true });
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
    const candidate =
      connectionMode === 'saved' && selectedConnection
        ? selectedConnection
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

  if (
    shouldConnectAutomatically &&
    (!credentialsReady || mutation.status === 'idle' || mutation.isPending)
  ) {
    return <WorkspaceLoading description="" label="Connecting…" />;
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="clio-landing-background absolute inset-0" />
      <section className="relative mx-auto grid min-h-dvh max-w-7xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:px-12">
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
                {connectionMode === 'saved' ? `Open ${brand.name}` : 'Add an agent service'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {connectionMode === 'saved'
                  ? 'Choose a service to continue.'
                  : 'Name the service and enter its address.'}
              </p>
            </div>
            {mutation.isPending ? <ClioStatus value="connecting" /> : null}
          </div>

          {mutation.isSuccess && mutation.data.sessions.length === 0 ? (
            <ConnectionEmptyService
              error={setup.error?.message}
              onCreate={(input) => setup.mutateAsync(input).then(() => undefined)}
              pending={setup.isPending}
              workspaces={mutation.data.workspaces}
            />
          ) : (
            <form className="grid gap-5" onSubmit={submit}>
              {connectionMode === 'saved' ? (
                <FieldSet>
                  <FieldLegend variant="label">Saved services</FieldLegend>
                  <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
                    {recents.map((recent) => {
                      const availability = connectionAvailability(availabilities, recent.endpoint);
                      const selected = recent.endpoint === selectedEndpoint;
                      const unavailable = availability.state === 'unavailable';
                      return (
                        <div
                          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center overflow-hidden rounded-xl border bg-background transition-colors data-[selected=true]:border-primary/45 data-[selected=true]:bg-primary/5"
                          data-selected={selected}
                          key={recent.endpoint}
                        >
                          <button
                            aria-pressed={selected}
                            className="flex min-w-0 items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
                            disabled={unavailable}
                            onClick={() => setSelectedEndpoint(recent.endpoint)}
                            type="button"
                          >
                            <FolderClockIcon
                              aria-hidden="true"
                              className="shrink-0 text-muted-foreground"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {recent.label || new URL(recent.endpoint).host}
                              </span>
                              <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                {recent.endpoint}
                              </span>
                            </span>
                          </button>
                          <ConnectionAvailabilityIndicator
                            availability={availability}
                            compact
                            endpoint={recent.endpoint}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                aria-label={`Service actions for ${recent.label || recent.endpoint}`}
                                className="mr-1"
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                              >
                                <MoreHorizontalIcon aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-52">
                              <DropdownMenuItem
                                onSelect={() => {
                                  const next = recents.find(
                                    (candidate) => candidate.endpoint !== recent.endpoint,
                                  );
                                  void forget(recent.endpoint);
                                  if (selectedEndpoint === recent.endpoint) {
                                    if (next) setSelectedEndpoint(next.endpoint);
                                    else setConnectionMode('new');
                                  }
                                }}
                                variant="destructive"
                              >
                                <Trash2Icon aria-hidden="true" /> Forget on this device
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    className="justify-start"
                    onClick={() => {
                      setConnectionMode('new');
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
                  {recents.length > 0 ? (
                    <Button
                      className="w-fit px-0"
                      onClick={() => {
                        setConnectionMode('saved');
                        mutation.reset();
                      }}
                      type="button"
                      variant="link"
                    >
                      <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" /> Saved services
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
                disabled={
                  mutation.isPending ||
                  (connectionMode === 'saved' &&
                    (!selectedConnection || selectedAvailability?.state === 'unavailable'))
                }
                type="submit"
              >
                <span>
                  {mutation.isPending
                    ? 'Connecting…'
                    : connectionMode === 'saved'
                      ? 'Open workspace'
                      : 'Connect'}
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
