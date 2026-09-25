import { inTauri } from '@/lib/transport/tauri-runtime';
import { installerRequestedLlamaCpp } from '@/lib/installer-infrastructure';
import type {
  McpUserConfiguration,
  RelayStatus,
  ServiceActionInput,
  ManagedServiceDefinition,
} from '@clio/core/v3';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CpuIcon,
  LaptopIcon,
  PackageOpenIcon,
  RefreshCwIcon,
  ServerIcon,
  ChevronDownIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { RadioGroup } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import type { SshHost } from '@/lib/ssh-hosts';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AgentServicesOverview } from './agent-services-overview';
import {
  ManagedServiceCard,
  type ServiceAction,
  type ServiceActionFeedback,
} from './managed-service-card';
import { WebSearchServiceConnection } from './web-search-service-connection';
import { webSearchConnectionMatchesTarget } from './web-search-configuration';
import { SshHostPicker } from './ssh-host-picker';
import {
  attachInfrastructureSshTransport,
  sshTransportStatus,
  type SshTransportStatus,
} from '@/tauri/ssh-infrastructure-transport';
import {
  InspectionProgress,
  SshAuthentication,
  TargetChoice,
  type ManagedTargetKind,
} from './managed-service-target';
import { targetLabel, targetMatchesHost, waitForOperation } from './managed-service-target-utils';

type Target = ManagedTargetKind;
/** Desktop controls for CLIO-managed providers and supporting resources. */
export function ManagedServices({
  onConnectWebSearch,
  onDisconnectWebSearch,
  webSearchConnected = false,
  webSearchConnection,
  webSearchConnecting = false,
  webSearchDisconnecting = false,
  connectedAgentLabel,
  connectedAgentLocation,
  onConnectExistingService,
  relayStatus,
}: {
  onConnectWebSearch?: (remoteUrl: string) => void;
  onDisconnectWebSearch?: () => void;
  webSearchConnected?: boolean;
  webSearchConnection?: McpUserConfiguration;
  webSearchConnecting?: boolean;
  webSearchDisconnecting?: boolean;
  connectedAgentLabel?: string;
  connectedAgentLocation?: string;
  onConnectExistingService?: () => void;
  relayStatus?: RelayStatus;
}) {
  const desktop = inTauri();
  const repository = useRepository();
  const { isManagedConnection, settings } = useConnectionSettings();
  const [target, setTarget] = useState<Target>('local');
  const [targetId, setTargetId] = useState('local');
  const [sshHost, setSshHost] = useState<SshHost>();
  const [transportStatus, setTransportStatus] = useState<SshTransportStatus>();
  const [transportOutput, setTransportOutput] = useState('');
  const [managedProvidersEnabled, setManagedProvidersEnabled] = useState(false);
  const [managerOpen, setManagerOpen] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [configuration, setConfiguration] = useState<Record<string, Record<string, string>>>({});
  const [results, setResults] = useState<Record<string, ServiceActionFeedback>>({});
  const canManageSshTargets = desktop && isManagedConnection;
  // The NSIS installer's Infrastructure page records a llama.cpp request as a
  // PREFERENCE only — it never installs a runtime itself. When set, this
  // finishes that intent by pointing the user at the model-runtime controls
  // already on this page instead of leaving the choice stranded.
  const installerLlamaCpp = useQuery({
    enabled: desktop,
    queryKey: ['installer-options', 'llama-cpp-requested'],
    queryFn: installerRequestedLlamaCpp,
    staleTime: Infinity,
  });
  const targets = useQuery({
    queryKey: ['infrastructure-targets', settings.endpoint],
    queryFn: ({ signal }) => repository.infrastructureTargets(signal),
    staleTime: 30_000,
  });
  const registerTarget = useMutation({
    mutationFn: async (host: SshHost) => {
      const definition = {
        kind: 'ssh' as const,
        label: host.label,
        install_root: host.installRoot,
        ssh: {
          profile: host.profile ?? '',
          host: host.host ?? '',
          user: host.user ?? '',
          port: host.port,
          identity_file: host.identityFile ?? '',
          jump_hosts: host.jumpHosts ?? [],
          platform: host.platform ?? 'auto',
        },
      };
      const existing = targets.data?.find((candidate) => targetMatchesHost(candidate, host));
      if (existing) return repository.updateInfrastructureTarget(existing.id, definition);
      return repository.createInfrastructureTarget(definition);
    },
    onSuccess: async (registered) => {
      setTargetId(registered.id);
      setTransportOutput('');
      const status = await attachInfrastructureSshTransport(
        settings.endpoint,
        settings.token,
        registered,
      );
      setTransportStatus(status);
      setTransportOutput(status.output);
      await repository.setInfrastructureTransportState(registered.id, status.state);
      await targets.refetch();
    },
  });
  const transportSessionId = transportStatus?.session_id;
  useEffect(() => {
    if (!transportSessionId) return;
    let active = true;
    const cleanup: Array<() => void> = [];
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      cleanup.push(
        await listen<{ session_id: string; data: string }>(
          'clio:ssh-transport-data',
          ({ payload }) => {
            if (!active || payload.session_id !== transportSessionId) return;
            setTransportOutput((current) => `${current}${payload.data}`.slice(-32_000));
          },
        ),
      );
      cleanup.push(
        await listen<{ session_id: string; state: SshTransportStatus['state'] }>(
          'clio:ssh-transport-state',
          ({ payload }) => {
            if (!active || payload.session_id !== transportSessionId) return;
            setTransportStatus((current) =>
              current ? { ...current, state: payload.state } : current,
            );
            void repository.setInfrastructureTransportState(targetId, payload.state);
            if (payload.state === 'connected') {
              void repository.infrastructureTargets().then(async (rows) => {
                const current = rows.find((row) => row.id === targetId);
                if (!current) return;
                const status = await attachInfrastructureSshTransport(
                  settings.endpoint,
                  settings.token,
                  current,
                );
                if (active) setTransportStatus(status);
              });
            }
          },
        ),
      );
      const snapshot = await sshTransportStatus(transportSessionId);
      if (active) {
        setTransportStatus(snapshot);
        setTransportOutput(snapshot.output);
      }
    });
    return () => {
      active = false;
      cleanup.forEach((stop) => stop());
    };
  }, [repository, settings.endpoint, settings.token, targetId, transportSessionId]);
  const catalog = useQuery({
    enabled:
      target === 'local' ||
      Boolean(sshHost && targetId !== 'local' && transportStatus?.state === 'connected'),
    queryKey: ['managed-service-catalog', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.managedServiceCatalog(targetId, signal),
    retry: false,
    staleTime: 30_000,
  });
  const action = useMutation({
    mutationFn: async (input: ServiceActionInput & { service_id: string }) => {
      const operation = await repository.runManagedServiceAction(input.service_id, input);
      return waitForOperation(repository, operation);
    },
    onMutate: (input) => {
      setResults((current) => {
        const next = { ...current };
        delete next[input.service_id];
        return next;
      });
    },
    onSuccess: async (result) => {
      setResults((current) => ({
        ...current,
        [result.service_id]: {
          action: result.action as ServiceAction,
          text:
            result.action === 'status'
              ? 'Status refreshed.'
              : result.action === 'logs'
                ? result.logs.trim() || 'No recent log output.'
                : result.logs || `${result.action} completed.`,
        },
      }));
      await catalog.refetch();
    },
    onError: (error, input) => {
      setResults((current) => ({
        ...current,
        [input.service_id]: {
          action: input.action as ServiceAction,
          error: true,
          text: error instanceof Error ? error.message : String(error),
        },
      }));
    },
  });
  const services = catalog.data?.services ?? [];
  const providers = services.filter((service) => service.category === 'model_runtime');
  const resources = services.filter((service) => service.category === 'scientific_service');
  const remoteAccess = services.filter(
    (service) => service.category === 'remote_access' && target === 'ssh',
  );
  const provider = providers.find((service) => service.id === selectedProvider);
  // "Installed" mirrors ServiceCard's own definition (running or stopped, as
  // opposed to never installed). This — not the transient managedProvidersEnabled
  // switch — is what the finish-setup banner gates on: a useState toggle is
  // per-visit and would make the banner reappear every time this page loads,
  // even after the user already finished the installer's llama.cpp request.
  const llamaCppService = services.find((service) => service.id === 'llama_cpp');
  const llamaCppInstalled =
    llamaCppService?.state === 'running' || llamaCppService?.state === 'stopped';

  const renderService = (service: ManagedServiceDefinition) => {
    const agentConnectionUrl = service.connection_url;
    const webSearchTargetConnected =
      service.id === 'web_search' &&
      webSearchConnectionMatchesTarget(webSearchConnected, webSearchConnection, agentConnectionUrl);
    return (
      <ManagedServiceCard
        activeAction={
          action.isPending && action.variables?.service_id === service.id
            ? action.variables.action
            : undefined
        }
        configuration={configuration[service.id] ?? {}}
        connectionStatus={
          service.id === 'web_search' && service.state === 'running' ? (
            <WebSearchServiceConnection
              connecting={action.isPending === false && webSearchConnecting}
              connection={webSearchConnection}
              targetUrl={agentConnectionUrl}
            />
          ) : undefined
        }
        key={service.id}
        onAction={(requestedAction) =>
          action.mutate({
            service_id: service.id,
            target_id: targetId,
            action: requestedAction,
            variant_id: variants[service.id] ?? service.recommended_variant,
            configuration: configuration[service.id] ?? {},
          })
        }
        onConfiguration={(field, value) =>
          setConfiguration((current) => ({
            ...current,
            [service.id]: { ...current[service.id], [field]: value },
          }))
        }
        onVariant={(value) => setVariants((current) => ({ ...current, [service.id]: value }))}
        connectionAction={
          service.id === 'web_search' && service.state === 'running'
            ? {
                label: webSearchTargetConnected
                  ? webSearchDisconnecting
                    ? 'Disconnecting…'
                    : 'Disconnect'
                  : webSearchConnecting
                    ? 'Connecting…'
                    : `Connect to ${vocab.agent}`,
                onSelect: webSearchTargetConnected
                  ? onDisconnectWebSearch
                  : !agentConnectionUrl
                    ? undefined
                    : () => onConnectWebSearch?.(agentConnectionUrl),
                pending: webSearchTargetConnected ? webSearchDisconnecting : webSearchConnecting,
                blockedReason: undefined,
              }
            : undefined
        }
        result={results[service.id]}
        service={service}
        variant={variants[service.id] ?? service.recommended_variant}
      />
    );
  };

  return (
    <section aria-labelledby="agent-services-title" className="mt-8 space-y-6">
      <AgentServicesOverview
        agentLabel={connectedAgentLabel}
        agentLocation={connectedAgentLocation}
        relay={relayStatus}
        webSearch={webSearchConnection}
        webSearchConnected={webSearchConnected}
      />

      {onConnectExistingService ? (
        <div className="flex justify-end">
          <Button onClick={onConnectExistingService} type="button" variant="outline">
            Connect existing service…
          </Button>
        </div>
      ) : null}

      <section className="border-y">
        <button
          aria-expanded={managerOpen}
          className="flex w-full items-center justify-between gap-4 py-4 text-left"
          onClick={() => setManagerOpen((open) => !open)}
          type="button"
        >
          <div>
            <h2 className="font-semibold">Manage deployments</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Inspect a computer, then install, connect, start, or stop its services.
            </p>
          </div>
          <ChevronDownIcon
            aria-hidden="true"
            className={`size-4 shrink-0 transition-transform ${managerOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {managerOpen ? (
          <div className="space-y-10 pb-8">
            <div className="relative overflow-hidden border-y bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_42%)] py-6">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-primary" />
              <div className="grid gap-6 px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(24rem,1.2fr)] lg:items-center">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                    Deployment target
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold" id="managed-services-title">
                    Where should this capability run?
                  </h2>
                  <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                    {canManageSshTargets
                      ? `Choose this computer or another computer over SSH. ${vocab.agent} owns the target and every managed deployment.`
                      : `Deploy directly on this ${vocab.agent}’s computer. The existing ${vocab.agent} connection carries every lifecycle request.`}
                  </p>
                  {catalog.data ? (
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                      <span>{catalog.data.facts.os}</span>
                      <span>{catalog.data.facts.arch}</span>
                      <span>{catalog.data.facts.accelerator} accelerator</span>
                      <span>
                        {catalog.data.facts.docker_available
                          ? 'Docker ready'
                          : catalog.data.facts.docker_installed
                            ? 'Docker installed, engine stopped'
                            : 'Docker not installed'}
                      </span>
                    </div>
                  ) : null}
                  <Button
                    className="mt-4"
                    disabled={catalog.isFetching}
                    onClick={() => catalog.refetch()}
                    size="sm"
                    variant="ghost"
                  >
                    {catalog.isFetching ? <Spinner aria-hidden="true" /> : <RefreshCwIcon />}
                    Inspect again
                  </Button>
                </div>

                <div className="space-y-3">
                  <RadioGroup
                    className={`grid gap-2 ${canManageSshTargets ? 'sm:grid-cols-2' : ''}`}
                    onValueChange={(value) => {
                      const next = value as Target;
                      setTarget(next);
                      if (next === 'local') {
                        setTargetId('local');
                        setSshHost(undefined);
                      }
                    }}
                    value={target}
                  >
                    <TargetChoice
                      description={
                        canManageSshTargets
                          ? 'Install and run services on this computer'
                          : `Install and run services beside this ${vocab.agent}`
                      }
                      icon={LaptopIcon}
                      label={
                        canManageSshTargets ? 'This computer' : `This ${vocab.agent}’s computer`
                      }
                      selected={target === 'local'}
                      value="local"
                    />
                    {canManageSshTargets ? (
                      <TargetChoice
                        description={`Let ${vocab.agent} manage a computer reached through Desktop SSH`}
                        icon={ServerIcon}
                        label="Another computer…"
                        selected={target === 'ssh'}
                        value="ssh"
                      />
                    ) : null}
                  </RadioGroup>
                  {target === 'ssh' ? (
                    <Field>
                      <FieldLabel>Saved SSH host</FieldLabel>
                      <SshHostPicker
                        onChange={(host) => {
                          setSshHost(host);
                          if (host) registerTarget.mutate(host);
                        }}
                        value={sshHost}
                      />
                      {registerTarget.error ? (
                        <p className="text-xs text-destructive">{registerTarget.error.message}</p>
                      ) : null}
                      {sshHost ? (
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span
                            className={
                              transportStatus?.state === 'connected'
                                ? 'text-success'
                                : transportStatus?.state === 'reauthentication_required'
                                  ? 'text-warning'
                                  : 'text-muted-foreground'
                            }
                            role="status"
                          >
                            {registerTarget.isPending
                              ? 'Reconnecting'
                              : transportStateLabel(
                                  transportStatus?.state ??
                                    targets.data?.find((item) => item.id === targetId)
                                      ?.transport_state ??
                                    'state_unknown',
                                )}
                          </span>
                          {transportStatus &&
                          ['disconnected', 'state_unknown'].includes(transportStatus.state) ? (
                            <Button
                              onClick={() => registerTarget.mutate(sshHost)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Connect
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      {transportStatus &&
                      ['reauthentication_required', 'reconnecting'].includes(
                        transportStatus.state,
                      ) ? (
                        <SshAuthentication
                          output={transportOutput}
                          sessionId={transportStatus.session_id}
                          state={transportStatus.state}
                        />
                      ) : null}
                    </Field>
                  ) : null}
                </div>
              </div>
            </div>

            {catalog.isPending && catalog.fetchStatus === 'fetching' ? (
              <InspectionProgress host={sshHost} target={target} />
            ) : null}
            {catalog.error ? (
              <Alert variant="destructive">
                <AlertTitle>Could not inspect {targetLabel(target, sshHost)}</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{catalog.error.message}</p>
                  <Button onClick={() => catalog.refetch()} size="sm" variant="outline">
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            <CapabilitySection
              description="Add one local model runtime only when this target needs it. Existing providers stay in Settings."
              icon={CpuIcon}
              title="Model runtime"
            >
              {installerLlamaCpp.data && !llamaCppInstalled ? (
                <Alert className="mb-4">
                  <CpuIcon aria-hidden="true" />
                  <AlertTitle>Finish setting up your local model runtime</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      {vocab.product} installed llama.cpp support during setup. Turn on model
                      runtime management below to finish configuring it.
                    </span>
                    <Button
                      onClick={() => {
                        setManagedProvidersEnabled(true);
                        setSelectedProvider('llama_cpp');
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Finish setup
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-4 border-y py-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)] lg:items-end">
                <div className="flex items-start justify-between gap-4 lg:pr-8">
                  <div>
                    <FieldLabel htmlFor="managed-provider-enabled">
                      Manage a model runtime with {vocab.agent}
                    </FieldLabel>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Leave this off when you already use ChatGPT, Claude, or another configured
                      provider. Those connections live in{' '}
                      <Link className="text-primary hover:underline" to="/settings/providers">
                        Models
                      </Link>
                      .
                    </p>
                  </div>
                  <Switch
                    checked={managedProvidersEnabled}
                    id="managed-provider-enabled"
                    onCheckedChange={setManagedProvidersEnabled}
                  />
                </div>
                <Field>
                  <FieldLabel htmlFor="managed-provider-choice">Runtime</FieldLabel>
                  <Select
                    disabled={!managedProvidersEnabled || !providers.length}
                    onValueChange={setSelectedProvider}
                    value={selectedProvider}
                  >
                    <SelectTrigger id="managed-provider-choice">
                      <SelectValue placeholder="Choose a compatible runtime" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.label}
                          {service.variants.some((variant) => variant.compatible)
                            ? ''
                            : ' — unavailable on this target'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {managedProvidersEnabled && provider ? (
                <div className="border-b">{renderService(provider)}</div>
              ) : null}
            </CapabilitySection>

            <CapabilitySection
              description={
                target === 'local'
                  ? 'Search, document conversion, and other scientific services available on this computer.'
                  : 'Search, document conversion, and remote-work services available on this host.'
              }
              icon={PackageOpenIcon}
              title="Scientific services"
            >
              <div className="divide-y border-y">{resources.map(renderService)}</div>
              {!catalog.isPending && !resources.length ? (
                <p className="border-y py-6 text-sm text-muted-foreground">
                  Choose a target to see the services {vocab.agent} can manage there.
                </p>
              ) : null}
            </CapabilitySection>

            {remoteAccess.length ? (
              <CapabilitySection
                description="Persistent access services for this remote computer."
                icon={ServerIcon}
                title="Remote access"
              >
                <div className="divide-y border-y">{remoteAccess.map(renderService)}</div>
              </CapabilitySection>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function transportStateLabel(state: SshTransportStatus['state']): string {
  return {
    connected: 'Connected',
    reconnecting: 'Reconnecting',
    reauthentication_required: 'Reauthentication required',
    disconnected: 'Disconnected',
    state_unknown: 'State unknown',
  }[state];
}

function CapabilitySection({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: typeof CpuIcon;
  title: string;
}) {
  return (
    <section>
      <header className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}
