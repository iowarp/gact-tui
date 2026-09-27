import type { ManagedServiceDefinition, ServiceAccess } from '@clio/core/v3';
import { ShieldAlertIcon, ShieldCheckIcon, ShieldIcon } from 'lucide-react';
import { useId } from 'react';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { vocab } from '@/lib/brand-vocabulary';

/** Configuration key of the "Shareable (no key)" choice, as the service declares it. */
export const SHAREABLE_FIELD = 'shareable';

/** The port the deployment will listen on: the one typed, else the engine default. */
function deploymentPort(service: ManagedServiceDefinition, configuration: Record<string, string>) {
  const typed = configuration.port?.trim();
  if (typed) return typed;
  return service.configuration_fields.find((field) => field.id === 'port')?.placeholder ?? '';
}

function reach(port: string): string {
  return port ? `port ${port} on this host` : 'its port on this host';
}

/**
 * Before install: who will be able to use the server. A keyed engine is
 * protected by a key the service makes and sends itself, unless the person
 * makes it shareable; an engine with no key support says so plainly.
 */
export function ServiceAccessChoice({
  configuration,
  onConfiguration,
  service,
}: {
  configuration: Record<string, string>;
  onConfiguration: (field: string, value: string) => void;
  service: ManagedServiceDefinition;
}) {
  const id = useId();
  if (service.category !== 'model_runtime') return null;
  const port = deploymentPort(service, configuration);
  if (!service.supports_api_key) {
    return (
      <p
        className="flex items-start gap-2 text-xs text-muted-foreground"
        data-mode="unprotected"
        data-slot="service-access"
      >
        <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Not protected: {service.label} has no API key support, so anyone who can reach{' '}
          {reach(port)} can use it.
        </span>
      </p>
    );
  }
  const shareable = configuration[SHAREABLE_FIELD] === 'true';
  return (
    <Field orientation="horizontal">
      <Switch
        checked={shareable}
        id={id}
        onCheckedChange={(checked) => onConfiguration(SHAREABLE_FIELD, checked ? 'true' : 'false')}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>Shareable (no key)</FieldLabel>
        <FieldDescription>
          {shareable
            ? `Anyone who can reach ${reach(port)} can use it, with no key.`
            : `Off: ${vocab.agent} protects it with a key it makes and sends for you.`}
        </FieldDescription>
      </FieldContent>
    </Field>
  );
}

const ACCESS_ICONS = {
  api_key: ShieldCheckIcon,
  shared: ShieldIcon,
  unprotected: ShieldAlertIcon,
} as const;

/** After install: who can use the server, as the service checked it. */
export function ServiceAccessLine({ access }: { access: ServiceAccess }) {
  const Icon = ACCESS_ICONS[access.mode];
  return (
    <p
      className={cn(
        'flex items-start gap-2 text-xs',
        access.mode === 'unprotected' ? 'text-warning' : 'text-muted-foreground',
      )}
      data-mode={access.mode}
      data-slot="service-access"
    >
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{access.detail}</span>
    </p>
  );
}
