import { inTauri } from '@/lib/transport/tauri-runtime';
import {
  managedServiceCatalog,
  runManagedServiceAction,
  sshProfiles,
  type ManagedServiceActionInput,
  type ManagedServiceDefinition,
} from '@/tauri/infrastructure-setup';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ContainerIcon,
  CpuIcon,
  ExternalLinkIcon,
  LaptopIcon,
  PackageOpenIcon,
  RefreshCwIcon,
  ServerIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ClioStatus } from '@/components/clio/status';
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
import { Input } from '@/components/ui/input';
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

type Target = 'local' | 'ssh';
type ServiceAction = ManagedServiceActionInput['action'];

const MODEL_PROVIDER_IDS = new Set<ManagedServiceDefinition['id']>(['vllm', 'llama_cpp']);

/** Desktop controls for CLIO-managed providers and supporting resources. */
export function ManagedServices({
  onConnectWebSearch,
  webSearchConnected = false,
  webSearchConnecting = false,
}: {
  onConnectWebSearch?: (remoteUrl: string) => void;
  webSearchConnected?: boolean;
  webSearchConnecting?: boolean;
}) {
  const desktop = inTauri();
  const [target, setTarget] = useState<Target>('local');
  const [profile, setProfile] = useState('');
  const [managedProvidersEnabled, setManagedProvidersEnabled] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [configuration, setConfiguration] = useState<Record<string, Record<string, string>>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const targetInput = useMemo(
    () => ({ target, ...(target === 'ssh' ? { ssh_profile: profile } : {}) }),
    [profile, target],
  );
  const profiles = useQuery({
    enabled: desktop,
    queryKey: ['managed-service-ssh-profiles'],
    queryFn: sshProfiles,
  });
  const catalog = useQuery({
    enabled: desktop && (target === 'local' || Boolean(profile)),
    queryKey: ['managed-service-catalog', target, profile],
    queryFn: () => managedServiceCatalog(targetInput),
    retry: false,
    staleTime: 30_000,
  });
  const action = useMutation({
    mutationFn: (input: ManagedServiceActionInput) => runManagedServiceAction(input),
    onMutate: (input) => {
      setResults((current) => ({
        ...current,
        [input.service_id]: `${actionLabel(input.action)} in progress on ${targetLabel(target, profile)}…`,
      }));
    },
    onSuccess: async (result) => {
      setResults((current) => ({
        ...current,
        [result.service_id]:
          result.action === 'status'
            ? ''
            : result.logs || `${result.action} completed on ${result.target}.`,
      }));
      await catalog.refetch();
    },
  });
  const services = catalog.data?.services ?? [];
  const providers = services.filter((service) => MODEL_PROVIDER_IDS.has(service.id));
  const resources = services.filter(
    (service) =>
      !MODEL_PROVIDER_IDS.has(service.id) &&
      (target === 'ssh' || !service.label.toLowerCase().includes('relay')),
  );
  const provider = providers.find((service) => service.id === selectedProvider);

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

  const renderService = (service: ManagedServiceDefinition) => (
    <ServiceCard
      activeAction={
        action.isPending && action.variables?.service_id === service.id
          ? action.variables.action
          : undefined
      }
      configuration={configuration[service.id] ?? {}}
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
              label: webSearchConnected
                ? 'View tools'
                : webSearchConnecting
                  ? 'Connecting…'
                  : `Connect to ${vocab.agent}`,
              onSelect:
                webSearchConnected || !service.connection_url
                  ? undefined
                  : () => onConnectWebSearch?.(service.connection_url!),
              pending: webSearchConnecting,
              to: webSearchConnected ? '/infrastructure/tools' : undefined,
            }
          : undefined
      }
      result={results[service.id]}
      service={service}
      variant={variants[service.id] ?? service.recommended_variant}
    />
  );

  return (
    <section aria-labelledby="managed-services-title" className="mt-8 space-y-10">
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
                <FieldLabel htmlFor="managed-service-ssh">Saved SSH host</FieldLabel>
                <Select onValueChange={setProfile} value={profile}>
                  <SelectTrigger id="managed-service-ssh">
                    <SelectValue placeholder="Choose a host" />
                  </SelectTrigger>
                  <SelectContent>
                    {(profiles.data ?? []).map((item) => (
                      <SelectItem key={item.name} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
        </div>
      </div>

      {catalog.isPending && catalog.fetchStatus === 'fetching' ? (
        <InspectionProgress profile={profile} target={target} />
      ) : null}
      {catalog.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not inspect {targetLabel(target, profile)}</AlertTitle>
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
        <div className="grid gap-4 border-y py-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)] lg:items-end">
          <div className="flex items-start justify-between gap-4 lg:pr-8">
            <div>
              <FieldLabel htmlFor="managed-provider-enabled">
                Manage a model runtime with {vocab.agent}
              </FieldLabel>
              <p className="mt-1 text-sm text-muted-foreground">
                Leave this off when you already use Codex, Claude, or another configured provider.
                Those connections live in{' '}
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

      {action.error ? <p className="text-sm text-destructive">{action.error.message}</p> : null}
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

function InspectionProgress({ profile, target }: { profile: string; target: Target }) {
  const remote = target === 'ssh';
  const place = targetLabel(target, profile);
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

function ServiceCard({
  activeAction,
  connectionAction,
  configuration,
  onAction,
  onConfiguration,
  onVariant,
  result,
  service,
  variant,
}: {
  activeAction?: ServiceAction;
  connectionAction?: { label: string; onSelect?: () => void; pending?: boolean; to?: string };
  configuration: Record<string, string>;
  onAction: (action: ServiceAction) => void;
  onConfiguration: (field: string, value: string) => void;
  onVariant: (value: string) => void;
  result?: string;
  service: ManagedServiceDefinition;
  variant: string;
}) {
  const compatible = service.variants.filter((item) => item.compatible);
  const installed = service.state === 'running' || service.state === 'stopped';
  const operable = installed || compatible.length > 0;
  const incompatibilityReasons = Array.from(
    new Set(service.variants.filter((item) => !item.compatible).map((item) => item.reason)),
  );
  const missing = service.configuration_fields.some(
    (field) => field.required && !configuration[field.id]?.trim(),
  );
  const actions: ServiceAction[] =
    service.state === 'running'
      ? ['status', 'logs', ...(service.supports_stop ? (['stop'] as const) : [])]
      : service.state === 'stopped'
        ? ['start', 'status', 'logs']
        : ['install'];
  return (
    <article className="grid gap-5 py-6 lg:grid-cols-[minmax(12rem,0.72fr)_minmax(0,1.28fr)]">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold">{service.label}</h3>
          <ServiceState compatible={Boolean(compatible.length)} state={service.state} />
        </div>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{service.description}</p>
        {service.connection_url ? (
          <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
            {service.connection_url}
          </p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-3">
        {compatible.length && service.state !== 'running' ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              Installation options
            </summary>
            <Select onValueChange={onVariant} value={variant}>
              <SelectTrigger aria-label={`${service.label} version`} className="mt-2 max-w-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {compatible.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label} · {item.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </details>
        ) : !installed ? (
          <div className="border-l-2 border-destructive py-1 pl-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <TriangleAlertIcon aria-hidden="true" className="size-4" /> Not available on this
              target
            </p>
            {incompatibilityReasons.map((reason) => (
              <p className="mt-1 text-xs text-destructive/90" key={reason}>
                {reason}
              </p>
            ))}
            {incompatibilityReasons.some((reason) => reason.includes('Docker')) ? (
              <a
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                href="https://docs.docker.com/desktop/"
                rel="noreferrer"
                target="_blank"
              >
                Docker Desktop guide <ExternalLinkIcon aria-hidden="true" className="size-3" />
              </a>
            ) : null}
          </div>
        ) : null}

        {compatible.length && service.state !== 'running'
          ? service.configuration_fields.map((field) =>
              field.options?.length ? (
                <Select
                  key={field.id}
                  onValueChange={(value) => onConfiguration(field.id, value)}
                  value={configuration[field.id]}
                >
                  <SelectTrigger aria-label={`${service.label} ${field.label}`}>
                    <SelectValue placeholder={field.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.id === 'model_path' ? (
                <ModelFileField
                  key={field.id}
                  label={`${service.label} ${field.label}`}
                  onChange={(value) => onConfiguration(field.id, value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={configuration[field.id] ?? ''}
                />
              ) : (
                <Input
                  aria-label={`${service.label} ${field.label}`}
                  key={field.id}
                  onChange={(event) => onConfiguration(field.id, event.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={configuration[field.id] ?? ''}
                />
              ),
            )
          : null}

        {service.state === 'running' && service.id === 'web_search' && !service.connection_url ? (
          <p className="text-sm text-destructive">
            {vocab.agent} could not determine this service address.
          </p>
        ) : null}

        {operable ? (
          <div className="flex flex-wrap gap-2">
            {connectionAction?.to ? (
              <Button asChild size="sm">
                <Link to={connectionAction.to}>{connectionAction.label}</Link>
              </Button>
            ) : connectionAction?.onSelect ? (
              <Button
                disabled={connectionAction.pending}
                onClick={connectionAction.onSelect}
                size="sm"
              >
                {connectionAction.pending ? <Spinner aria-hidden="true" /> : null}
                {connectionAction.label}
              </Button>
            ) : null}
            {actions.map((name) => (
              <Button
                disabled={Boolean(activeAction) || !variant || (name === 'start' && missing)}
                key={name}
                onClick={() => onAction(name)}
                size="sm"
                variant={name === 'start' ? 'default' : 'outline'}
              >
                {activeAction === name ? <Spinner aria-hidden="true" /> : null}
                {activeAction === name ? `${actionLabel(name)}…` : actionLabel(name)}
              </Button>
            ))}
          </div>
        ) : null}

        {result ? (
          <pre
            aria-live="polite"
            className="max-h-28 overflow-auto whitespace-pre-wrap border-l-2 border-primary/40 py-1 pl-3 text-xs text-muted-foreground"
          >
            {result}
          </pre>
        ) : null}
      </div>
    </article>
  );
}

function ServiceState({
  compatible,
  state,
}: {
  compatible: boolean;
  state: ManagedServiceDefinition['state'];
}) {
  if (state === 'running') return <ClioStatus label="Running" value="healthy" />;
  if (state === 'stopped') return <ClioStatus label="Stopped" value="degraded" />;
  if (!compatible) return <ClioStatus label="Unavailable here" value="unavailable" />;
  if (state === 'not_installed') return <ClioStatus label="Not installed" value="unavailable" />;
  return <ClioStatus label="Optional" value="unavailable" />;
}

function ModelFileField({
  label,
  onChange,
  placeholder,
  required,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  required: boolean;
  value: string;
}) {
  const choose = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: false,
      filters: [{ name: 'GGUF model', extensions: ['gguf'] }],
      multiple: false,
      title: 'Choose a GGUF model',
    });
    if (typeof selected === 'string') onChange(selected);
  };
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <Input
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
      <Button onClick={() => void choose()} type="button" variant="outline">
        Choose GGUF file
      </Button>
    </div>
  );
}

function actionLabel(action: ServiceAction): string {
  const labels: Record<ServiceAction, string> = {
    install: 'Install',
    start: 'Start',
    status: 'Check status',
    logs: 'View logs',
    stop: 'Stop',
  };
  return labels[action];
}

function targetLabel(target: Target, profile: string): string {
  return target === 'local' ? 'this computer' : profile || 'the SSH host';
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
