import { inTauri } from '@/lib/transport/tauri-runtime';
import { installerRequestedLlamaCpp } from '@/lib/installer-infrastructure';
import type { McpUserConfiguration, RelayStatus } from '@clio/core/v3';
import {
  managedServiceCatalog,
  runManagedServiceAction,
  type ManagedServiceActionInput,
  type ManagedServiceDefinition,
} from '@/tauri/infrastructure-setup';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ContainerIcon,
  CpuIcon,
  LaptopIcon,
  PackageOpenIcon,
  RefreshCwIcon,
  ServerIcon,
  ChevronDownIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { vocab } from '@/lib/brand-vocabulary';
import { sshHostTarget, type SshHost } from '@/lib/ssh-hosts';
import { AgentServicesOverview } from './agent-services-overview';
import {
  ManagedServiceCard,
  type ServiceAction,
  type ServiceActionFeedback,
} from './managed-service-card';
import { WebSearchServiceConnection } from './web-search-service-connection';
import { webSearchConnectionMatchesTarget } from './web-search-configuration';
import { SshHostPicker } from './ssh-host-picker';
import type { SshTunnelSettings } from '@/tauri/ssh-tunnel';

type Target = 'local' | 'ssh';
/** Desktop controls for CLIO-managed providers and supporting resources. */
export function ManagedServices({
  onConnectWebSearch,
  onDisconnectWebSearch,
  webSearchConnected = false,
  webSearchConnection,
  webSearchConnecting = false,
  webSearchDisconnecting = false,
  connectedAgentTunnel,
  connectedAgentLabel,
  relayStatus,
}: {
  onConnectWebSearch?: (remoteUrl: string) => void;
  onDisconnectWebSearch?: () => void;
  webSearchConnected?: boolean;
  webSearchConnection?: McpUserConfiguration;
  webSearchConnecting?: boolean;
  webSearchDisconnecting?: boolean;
  connectedAgentTunnel?: SshTunnelSettings;
  connectedAgentLabel?: string;
  relayStatus?: RelayStatus;
}) {
  const desktop = inTauri();
  const [target, setTarget] = useState<Target>('local');
  const [sshHost, setSshHost] = useState<SshHost>();
  const [managedProvidersEnabled, setManagedProvidersEnabled] = useState(false);
  const [managerOpen, setManagerOpen] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [configuration, setConfiguration] = useState<Record<string, Record<string, string>>>({});
  const [results, setResults] = useState<Record<string, ServiceActionFeedback>>({});
  const targetInput = useMemo(
    () => (target === 'ssh' && sshHost ? sshHostTarget(sshHost) : { target }),
    [sshHost, target],
  );
  const targetIdentity = useMemo(() => JSON.stringify(targetInput), [targetInput]);
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
  const catalog = useQuery({
    enabled: desktop && (target === 'local' || Boolean(sshHost)),
    queryKey: ['managed-service-catalog', targetIdentity],
    queryFn: () => managedServiceCatalog(targetInput),
    retry: false,
    staleTime: 30_000,
  });
  const action = useMutation({
    mutationFn: (input: ManagedServiceActionInput) => runManagedServiceAction(input),
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
              ? `Status refreshed on ${result.target}.`
              : result.action === 'logs'
                ? result.logs.trim() || 'No recent log output.'
                : result.logs || `${result.action} completed on ${result.target}.`,
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

  if (!desktop) {
    return (
      <Frame className="mt-6" spacing="sm">
        <FrameHeader>
          <FrameTitle aria-level={2} className="flex items-center gap-2" role="heading">
            <ContainerIcon aria-hidden="true" className="size-4 text-primary" /> Managed
            infrastructure
          </FrameTitle>
          <FrameDescription>
            Connect services here. Installing and operating services on a computer is available in{' '}
            {vocab.product}.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Connection mode</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This browser can use existing model, search, and Relay services without managing the
              host that runs them.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/settings/providers">Open model settings</Link>
          </Button>
        </FramePanel>
      </Frame>
    );
  }

  const renderService = (service: ManagedServiceDefinition) => {
    const agentConnectionUrl =
      service.id === 'web_search'
        ? webSearchAgentUrl(service.connection_url, target, sshHost, connectedAgentTunnel)
        : service.connection_url;
    const webSearchTargetConnected =
      service.id === 'web_search' &&
      !connectionBlocker(target, sshHost, connectedAgentTunnel) &&
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
            ...targetInput,
            service_id: service.id,
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
                  : !agentConnectionUrl || connectionBlocker(target, sshHost, connectedAgentTunnel)
                    ? undefined
                    : () => onConnectWebSearch?.(agentConnectionUrl),
                pending: webSearchTargetConnected ? webSearchDisconnecting : webSearchConnecting,
                blockedReason: webSearchTargetConnected
                  ? undefined
                  : connectionBlocker(target, sshHost, connectedAgentTunnel, connectedAgentLabel),
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
        agentTunnel={connectedAgentTunnel}
        onDisconnectWebSearch={onDisconnectWebSearch}
        relay={relayStatus}
        webSearch={webSearchConnection}
        webSearchConnected={webSearchConnected}
        webSearchDisconnecting={webSearchDisconnecting}
      />

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
                    Choose this device or a saved SSH host. {vocab.agent} inspects the target before
                    showing what can be installed, connected, or operated there.
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
                    className="grid gap-2 sm:grid-cols-2"
                    onValueChange={(value) => setTarget(value as Target)}
                    value={target}
                  >
                    <TargetChoice
                      description="Install and run services on this device"
                      icon={LaptopIcon}
                      label="This computer"
                      selected={target === 'local'}
                      value="local"
                    />
                    <TargetChoice
                      description="Use a computer already saved in SSH"
                      icon={ServerIcon}
                      label="Remote host"
                      selected={target === 'ssh'}
                      value="ssh"
                    />
                  </RadioGroup>
                  {target === 'ssh' ? (
                    <Field>
                      <FieldLabel>Saved SSH host</FieldLabel>
                      <SshHostPicker onChange={setSshHost} value={sshHost} />
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
                      Leave this off when you already use Codex, Claude, or another configured
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

function InspectionProgress({ host, target }: { host?: SshHost; target: Target }) {
  const remote = target === 'ssh';
  const place = targetLabel(target, host);
  return (
    <Alert className="mt-4" role="status">
      <Spinner aria-hidden="true" />
      <AlertTitle>{remote ? `Connecting to ${place}` : 'Inspecting this computer'}</AlertTitle>
      <AlertDescription>
        {remote
          ? `Checking the SSH connection, operating system, Docker, runtimes, acceleration, and existing ${vocab.agent} services.`
          : `Checking the operating system, Docker, local runtimes, acceleration, and existing ${vocab.agent} services.`}{' '}
        You can keep using {vocab.agent} while this finishes.
      </AlertDescription>
    </Alert>
  );
}

function targetLabel(target: Target, host?: SshHost): string {
  return target === 'local' ? 'this computer' : host?.label || 'the SSH host';
}

function sameSshTarget(host: SshHost | undefined, tunnel: SshTunnelSettings): boolean {
  if (!host) return false;
  if (host.profile && tunnel.profile) {
    return host.profile.toLowerCase() === tunnel.profile.toLowerCase();
  }
  return (
    Boolean(host.host && tunnel.host) &&
    host.host?.toLowerCase() === tunnel.host.toLowerCase() &&
    host.port === (tunnel.port ?? 22) &&
    (host.user ?? '') === tunnel.user
  );
}

/**
 * Resolve the service address from the connected agent's network perspective.
 * The desktop reaches an SSH deployment through its host address, while a CLIO
 * agent running on that exact host should use loopback and avoid depending on
 * firewall, Docker publication, or campus routing rules.
 */
function webSearchAgentUrl(
  discoveredUrl: string | null | undefined,
  target: Target,
  host: SshHost | undefined,
  connectedAgentTunnel?: SshTunnelSettings,
): string | undefined {
  if (!discoveredUrl) return undefined;
  if (target !== 'ssh' || !connectedAgentTunnel || !sameSshTarget(host, connectedAgentTunnel)) {
    return discoveredUrl;
  }
  try {
    const url = new URL(discoveredUrl);
    url.hostname = '127.0.0.1';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return discoveredUrl;
  }
}

function connectionBlocker(
  target: Target,
  host: SshHost | undefined,
  connectedAgentTunnel?: SshTunnelSettings,
  connectedAgentLabel = vocab.agent,
): string | undefined {
  if (!connectedAgentTunnel) return undefined;
  if (target === 'local') {
    return `${connectedAgentLabel} runs remotely, so it cannot use a service bound to this desktop. Choose the same remote host as the connected ${vocab.agent}.`;
  }
  if (!sameSshTarget(host, connectedAgentTunnel)) {
    return `${connectedAgentLabel} can connect only to services on its own remote host. Choose that host, or connect a local ${vocab.agent} first.`;
  }
  return undefined;
}

function TargetChoice({
  description,
  icon: Icon,
  label,
  selected,
  value,
}: {
  description: string;
  icon: typeof LaptopIcon;
  label: string;
  selected: boolean;
  value: Target;
}) {
  return (
    <FieldLabel
      className={`group grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 border p-4 transition-colors hover:border-primary/60 ${
        selected ? 'border-primary bg-primary/8' : 'border-border bg-background/60'
      }`}
      htmlFor={`managed-target-${value}`}
    >
      <RadioGroupItem className="sr-only" id={`managed-target-${value}`} value={value} />
      <span className="row-span-2 grid size-9 place-items-center rounded-full bg-muted text-muted-foreground group-hover:text-primary">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="font-medium">{label}</span>
      <span className="text-xs font-normal text-muted-foreground">{description}</span>
    </FieldLabel>
  );
}
