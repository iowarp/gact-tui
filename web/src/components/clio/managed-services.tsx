import { inTauri } from '@/lib/transport/tauri-runtime';
import {
  managedServices,
  preflightTarget,
  runManagedServiceAction,
  sshProfiles,
  type ManagedServiceActionInput,
  type ManagedServiceDefinition,
} from '@/tauri/infrastructure-setup';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ContainerIcon, LaptopIcon, ServerIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
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

type Target = 'local' | 'ssh';

/** Compact desktop-only controls for the four compiled service drivers. */
export function ManagedServices() {
  const desktop = inTauri();
  const [target, setTarget] = useState<Target>('local');
  const [profile, setProfile] = useState('');
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
    queryFn: async () => ({
      facts: await preflightTarget(targetInput),
      services: await managedServices(targetInput),
    }),
  });
  const action = useMutation({
    mutationFn: (input: ManagedServiceActionInput) => runManagedServiceAction(input),
    onSuccess: (result) =>
      setResults((current) => ({
        ...current,
        [result.service_id]: result.logs || `${result.action} completed on ${result.target}.`,
      })),
  });

  if (!desktop) {
    return (
      <Alert className="mt-6">
        <ContainerIcon aria-hidden="true" />
        <AlertTitle>Service deployment is available in CLIO Desktop</AlertTitle>
        <AlertDescription>
          This browser can connect to existing model, search, and Relay services. Open the installed
          desktop app to inspect a machine and deploy a supported version.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section
      aria-labelledby="managed-services-title"
      className="mt-6 rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-medium" id="managed-services-title">
            Managed services
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose this computer or an SSH host. CLIO recommends only compatible pinned builds.
          </p>
        </div>
        {catalog.data ? (
          <p className="text-xs text-muted-foreground">
            {catalog.data.facts.os} · {catalog.data.facts.arch} · {catalog.data.facts.accelerator}{' '}
            accelerator
          </p>
        ) : null}
      </div>

      <RadioGroup
        className="mt-4 flex flex-wrap gap-4"
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

      {catalog.error ? (
        <p className="mt-3 text-sm text-destructive">{catalog.error.message}</p>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(catalog.data?.services ?? []).map((service) => (
          <ServiceCard
            busy={action.isPending && action.variables?.service_id === service.id}
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
        ))}
      </div>
      {action.error ? (
        <p className="mt-3 text-sm text-destructive">{action.error.message}</p>
      ) : null}
    </section>
  );
}

function ServiceCard({
  busy,
  configuration,
  onAction,
  onConfiguration,
  onVariant,
  result,
  service,
  variant,
}: {
  busy: boolean;
  configuration: Record<string, string>;
  onAction: (action: ManagedServiceActionInput['action']) => void;
  onConfiguration: (field: string, value: string) => void;
  onVariant: (value: string) => void;
  result?: string;
  service: ManagedServiceDefinition;
  variant: string;
}) {
  const compatible = service.variants.filter((item) => item.compatible);
  const missing = service.configuration_fields.some(
    (field) => field.required && !configuration[field.id]?.trim(),
  );
  return (
    <article className="rounded-lg border p-3">
      <h3 className="font-medium">{service.label}</h3>
      <p className="text-xs text-muted-foreground">{service.description}</p>
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
        <p className="mt-3 text-sm text-warning">No compatible pinned build was detected.</p>
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
            disabled={busy || !variant || (name === 'start' && missing)}
            key={name}
            onClick={() => onAction(name)}
            size="sm"
            variant={name === 'start' ? 'default' : 'outline'}
          >
            {name[0].toUpperCase() + name.slice(1)}
          </Button>
        ))}
        {service.supports_stop ? (
          <Button
            disabled={busy || !variant}
            onClick={() => onAction('stop')}
            size="sm"
            variant="outline"
          >
            Stop
          </Button>
        ) : null}
      </div>
      {result ? (
        <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap text-xs">{result}</pre>
      ) : null}
    </article>
  );
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
