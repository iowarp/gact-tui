import { brand } from '@brand';
import { PROTOCOL_VERSION } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  BrainCircuitIcon,
  ChartNoAxesCombinedIcon,
  ChevronDownIcon,
  FolderClockIcon,
  MoreHorizontalIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClioStatus } from '@/components/clio/status';
import { ConnectionEmptyService } from '@/components/clio/connection-empty-service';
import { WorkspaceLoading } from '@/components/clio/workspace-route-surfaces';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createRepository, DEFAULT_ENDPOINT, normalizeEndpoint } from '@/lib/connection';
import {
  connectionSessionRoute,
  connectionSessionTargetForRoute,
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
  const [endpointDraft, setEndpoint] = useState<string>();
  const [serviceNameDraft, setServiceName] = useState<string>();
  const [token, setToken] = useState('');
  const endpoint = endpointDraft ?? settings.endpoint;
  const serviceName = serviceNameDraft ?? settings.label ?? '';
  const autoConnectStarted = useRef(false);
  const connectionIntent = searchParams.get('intent');
  const shouldConnectAutomatically =
    (recents.length > 0 || managedConnectionReady) && connectionIntent !== 'connect';

  const mutation = useMutation({
    mutationFn: async () => {
      const next = await resolveConnection({
        endpoint: normalizeEndpoint(endpoint),
        token: token || undefined,
        label: serviceName.trim() || undefined,
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
      const target =
        connectionSessionTargetForRoute(lastWorkspaceRoute(next.endpoint), workspaces, sessions) ??
        latestConnectionSessionTarget(workspaces, sessions);
      await connect(next);
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
      endpoint !== settings.endpoint ||
      connectionIntent === 'connect'
    )
      return;
    autoConnectStarted.current = true;
    mutation.mutate();
  }, [
    connectionIntent,
    credentialsReady,
    endpoint,
    managedConnectionReady,
    mutation,
    recents.length,
    settings.endpoint,
  ]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
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
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <p className="font-heading text-xl font-semibold">Open {brand.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a saved connection or enter a new address.
              </p>
            </div>
            <ClioStatus
              value={mutation.isPending ? 'connecting' : mutation.isSuccess ? 'live' : 'offline'}
              label={
                mutation.isPending ? undefined : mutation.isSuccess ? 'Connected' : 'Not connected'
              }
            />
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
              <div className="grid gap-2">
                <Label htmlFor="service-name">Service name</Label>
                <Input
                  autoComplete="off"
                  className="h-11"
                  id="service-name"
                  onChange={(event) => setServiceName(event.target.value)}
                  placeholder="For example, Homelab"
                  value={serviceName}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endpoint">Connection address</Label>
                {recents.length > 0 ? (
                  <div className="flex gap-2">
                    <Select
                      onValueChange={(value) => {
                        const saved = recents.find((recent) => recent.endpoint === value);
                        setEndpoint(value);
                        setServiceName(saved?.label ?? '');
                        setToken('');
                      }}
                      value={recents.some((recent) => recent.endpoint === endpoint) ? endpoint : ''}
                    >
                      <SelectTrigger aria-label="Saved connections" className="h-11 min-w-0 flex-1">
                        <FolderClockIcon
                          aria-hidden="true"
                          className="size-4 text-muted-foreground"
                        />
                        <SelectValue placeholder="Choose a saved connection" />
                      </SelectTrigger>
                      <SelectContent>
                        {recents.map((recent) => (
                          <SelectItem key={recent.endpoint} value={recent.endpoint}>
                            <span className="truncate">{recent.label || recent.endpoint}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label="Manage saved connections"
                          className="size-11"
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <MoreHorizontalIcon aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72">
                        <DropdownMenuLabel>Saved connections</DropdownMenuLabel>
                        {recents.map((recent) => (
                          <DropdownMenuItem
                            className="justify-between gap-3"
                            key={recent.endpoint}
                            onSelect={() => {
                              void forget(recent.endpoint);
                              if (endpoint === recent.endpoint) {
                                setEndpoint(
                                  recents.find(
                                    (candidate) => candidate.endpoint !== recent.endpoint,
                                  )?.endpoint ?? DEFAULT_ENDPOINT,
                                );
                                setServiceName(
                                  recents.find(
                                    (candidate) => candidate.endpoint !== recent.endpoint,
                                  )?.label ?? '',
                                );
                              }
                            }}
                            variant="destructive"
                          >
                            <span className="truncate text-xs">
                              Forget {recent.label || recent.endpoint}
                            </span>
                            <Trash2Icon aria-hidden="true" className="size-4" />
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}
                <div className="relative">
                  <Input
                    autoComplete="url"
                    className="h-11 font-mono text-sm"
                    id="endpoint"
                    onChange={(event) => setEndpoint(event.target.value)}
                    placeholder={DEFAULT_ENDPOINT}
                    required
                    value={endpoint}
                  />
                </div>
              </div>
              <details className="group rounded-lg border bg-muted/15 px-3 py-2">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
                  Advanced settings
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="mt-4 grid gap-2 border-t pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="token">Access token</Label>
                    <span className="text-xs text-muted-foreground">
                      {inTauri() ? 'Saved securely on this device' : 'Kept in memory only'}
                    </span>
                  </div>
                  <Input
                    autoComplete="off"
                    className="h-11 font-mono"
                    id="token"
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Optional"
                    type="password"
                    value={token}
                  />
                </div>
              </details>

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
                disabled={mutation.isPending}
                type="submit"
              >
                <span>{mutation.isPending ? 'Connecting…' : 'Open workspace'}</span>
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
