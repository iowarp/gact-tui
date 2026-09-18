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
  ChevronDownIcon,
  ContainerIcon,
  CpuIcon,
  LaptopIcon,
  PackageOpenIcon,
  ServerIcon,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

type Target = 'local' | 'ssh';
type ServiceAction = ManagedServiceActionInput['action'];

const MODEL_PROVIDER_IDS = new Set<ManagedServiceDefinition['id']>(['vllm', 'llama_cpp']);

/** Desktop controls for CLIO-managed providers and supporting resources. */
export function ManagedServices() {
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
        [result.service_id]: result.logs || `${result.action} completed on ${result.target}.`,
      }));
      await catalog.refetch();
    },
  });
  const services = catalog.data?.services ?? [];
  const providers = services.filter((service) => MODEL_PROVIDER_IDS.has(service.id));
  const resources = services.filter((service) => !MODEL_PROVIDER_IDS.has(service.id));
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
            Connect services here. Installing and operating services on a computer is available in
            CLIO Desktop.
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
      result={results[service.id]}
      service={service}
      variant={variants[service.id] ?? service.recommended_variant}
    />
  );

  return (
    <Frame aria-labelledby="managed-services-title" className="mt-6" spacing="sm">
      <FrameHeader className="flex-row flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <FrameTitle
            aria-level={2}
            className="flex items-center gap-2"
            id="managed-services-title"
            role="heading"
          >
            <ContainerIcon aria-hidden="true" className="size-4 text-primary" />
            Managed infrastructure
          </FrameTitle>
          <FrameDescription>
            Inspect this computer or a saved SSH host, then manage only the capabilities you need.
          </FrameDescription>
        </div>
        {catalog.data ? (
          <p className="text-xs text-muted-foreground">
            {catalog.data.facts.os} · {catalog.data.facts.arch} · {catalog.data.facts.accelerator}{' '}
            accelerator
          </p>
        ) : null}
      </FrameHeader>

      <FramePanel>
        <RadioGroup
          className="flex flex-wrap gap-4"
          onValueChange={(value) => setTarget(value as Target)}
          value={target}
        >
          <TargetChoice icon={LaptopIcon} label="This computer" value="local" />
          <TargetChoice icon={ServerIcon} label="SSH host" value="ssh" />
        </RadioGroup>
        {target === 'ssh' ? (
          <Field className="mt-3 max-w-sm">
            <FieldLabel htmlFor="managed-service-ssh">SSH host</FieldLabel>
            <Select onValueChange={setProfile} value={profile}>
              <SelectTrigger id="managed-service-ssh">
                <SelectValue placeholder="Choose a saved SSH profile" />
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

        {catalog.isPending && catalog.fetchStatus === 'fetching' ? (
          <InspectionProgress profile={profile} target={target} />
        ) : null}
        {catalog.error ? (
          <Alert className="mt-4" variant="destructive">
            <AlertTitle>Could not inspect {targetLabel(target, profile)}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{catalog.error.message}</p>
              <Button onClick={() => catalog.refetch()} size="sm" variant="outline">
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </FramePanel>

      <FramePanel className="grid gap-0 py-0">
        <ManagedGroup
          description="Run an approved local model server managed by CLIO. Existing providers remain in Settings."
          icon={CpuIcon}
          title="Model providers"
        >
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <FieldLabel htmlFor="managed-provider-enabled">
                  Enable a CLIO-managed provider
                </FieldLabel>
                <p className="mt-1 text-xs text-muted-foreground">
                  To connect an existing provider, visit{' '}
                  <Link
                    className="text-primary underline-offset-4 hover:underline"
                    to="/settings/providers"
                  >
                    Settings › Models
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
            <Field className="mt-3 max-w-sm">
              <FieldLabel htmlFor="managed-provider-choice">Provider</FieldLabel>
              <Select
                disabled={!managedProvidersEnabled || !providers.length}
                onValueChange={setSelectedProvider}
                value={selectedProvider}
              >
                <SelectTrigger id="managed-provider-choice">
                  <SelectValue placeholder="Choose a provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {managedProvidersEnabled && provider ? (
            <div className="mt-3 max-w-2xl">{renderService(provider)}</div>
          ) : null}
        </ManagedGroup>

        <ManagedGroup
          defaultOpen
          description="Private services that extend CLIO with search, documents, and remote work."
          icon={PackageOpenIcon}
          title="CLIO resources"
        >
          <div className="grid gap-3 md:grid-cols-2">{resources.map(renderService)}</div>
          {!catalog.isPending && !resources.length ? (
            <p className="text-sm text-muted-foreground">No managed resources were reported.</p>
          ) : null}
        </ManagedGroup>
      </FramePanel>

      {action.error ? (
        <p className="mt-3 text-sm text-destructive">{action.error.message}</p>
      ) : null}
    </Frame>
  );
}

function ManagedGroup({
  children,
  defaultOpen = false,
  description,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  description: string;
  icon: typeof CpuIcon;
  title: string;
}) {
  return (
    <Collapsible className="group border-b last:border-b-0" defaultOpen={defaultOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-3 p-3 text-left" type="button">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{title}</span>
            <span className="block text-xs text-muted-foreground">{description}</span>
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-4">{children}</CollapsibleContent>
    </Collapsible>
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
          ? 'Checking the SSH connection, operating system, Docker, runtimes, acceleration, and existing CLIO services.'
          : 'Checking the operating system, Docker, local runtimes, acceleration, and existing CLIO services.'}{' '}
        You can keep using CLIO while this finishes.
      </AlertDescription>
    </Alert>
  );
}

function ServiceCard({
  activeAction,
  configuration,
  onAction,
  onConfiguration,
  onVariant,
  result,
  service,
  variant,
}: {
  activeAction?: ServiceAction;
  configuration: Record<string, string>;
  onAction: (action: ServiceAction) => void;
  onConfiguration: (field: string, value: string) => void;
  onVariant: (value: string) => void;
  result?: string;
  service: ManagedServiceDefinition;
  variant: string;
}) {
  const compatible = service.variants.filter((item) => item.compatible);
  const incompatibilityReasons = Array.from(
    new Set(service.variants.filter((item) => !item.compatible).map((item) => item.reason)),
  );
  const missing = service.configuration_fields.some(
    (field) => field.required && !configuration[field.id]?.trim(),
  );
  return (
    <article className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{service.label}</h3>
          <p className="text-xs text-muted-foreground">{service.description}</p>
        </div>
        <ServiceState state={service.state} />
      </div>
      {compatible.length ? (
        <Select onValueChange={onVariant} value={variant}>
          <SelectTrigger aria-label={`${service.label} version`} className="mt-3">
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
      ) : (
        <div className="mt-3 text-sm text-warning">
          <p>No compatible pinned build was detected.</p>
          {incompatibilityReasons.map((reason) => (
            <p className="text-xs text-muted-foreground" key={reason}>
              {reason}
            </p>
          ))}
        </div>
      )}
      {service.configuration_fields.map((field) =>
        field.options?.length ? (
          <Select
            key={field.id}
            onValueChange={(value) => onConfiguration(field.id, value)}
            value={configuration[field.id]}
          >
            <SelectTrigger aria-label={`${service.label} ${field.label}`} className="mt-2">
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
        ) : (
          <Input
            aria-label={`${service.label} ${field.label}`}
            className="mt-2"
            key={field.id}
            onChange={(event) => onConfiguration(field.id, event.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            value={configuration[field.id] ?? ''}
          />
        ),
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {(['install', 'start', 'status', 'logs'] as const).map((name) => (
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
        {service.supports_stop ? (
          <Button
            disabled={Boolean(activeAction) || !variant}
            onClick={() => onAction('stop')}
            size="sm"
            variant="outline"
          >
            {activeAction === 'stop' ? <Spinner aria-hidden="true" /> : null}
            {activeAction === 'stop' ? 'Stopping…' : 'Stop'}
          </Button>
        ) : null}
      </div>
      {result ? (
        <pre
          aria-live="polite"
          className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs"
        >
          {result}
        </pre>
      ) : null}
    </article>
  );
}

function ServiceState({ state }: { state: ManagedServiceDefinition['state'] }) {
  if (state === 'running') return <ClioStatus label="Running" value="healthy" />;
  if (state === 'stopped') return <ClioStatus label="Stopped" value="degraded" />;
  if (state === 'not_installed') return <ClioStatus label="Not installed" value="unavailable" />;
  return <ClioStatus label="Not checked" value="unknown" />;
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
  icon: Icon,
  label,
  value,
}: {
  icon: typeof LaptopIcon;
  label: string;
  value: Target;
}) {
  return (
    <FieldLabel
      className="flex cursor-pointer items-center gap-2"
      htmlFor={`managed-target-${value}`}
    >
      <RadioGroupItem id={`managed-target-${value}`} value={value} />
      <Icon aria-hidden="true" className="size-4" /> {label}
    </FieldLabel>
  );
}
