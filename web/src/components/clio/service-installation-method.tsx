import type { ManagedServiceDefinition } from '@clio/core/v3';
import { useId, useRef } from 'react';
import {
  installationMethod,
  type InstallationMethod as Method,
} from './service-installation-model';
import { Field, FieldLabel } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const labels: Record<Method, string> = {
  native: 'Native',
  container: 'Containers',
  other: 'Other',
};

function methods(service: ManagedServiceDefinition): Method[] {
  return service.variants.some((row) => installationMethod(row) === 'other')
    ? ['native', 'container', 'other']
    : ['native', 'container'];
}

/** A host-specific method summary shown before opening the installation form. */
export function ServiceMethodAvailability({ service }: { service: ManagedServiceDefinition }) {
  return (
    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {methods(service).map((method) => {
        const rows = service.variants.filter((row) => installationMethod(row) === method);
        const available = rows.some((row) => row.compatible);
        return (
          <span key={method} className={available ? 'text-foreground' : 'text-muted-foreground'}>
            {labels[method]}:{' '}
            {available ? 'available' : rows.length ? 'unavailable here' : 'not offered'}
          </span>
        );
      })}
    </span>
  );
}

/** Select Native or Containers before configuring a variant; never change an installed method. */
export function ServiceInstallationMethod({
  service,
  variant,
  onVariant,
}: {
  service: ManagedServiceDefinition;
  variant: string;
  onVariant: (value: string) => void;
}) {
  const id = useId();
  const remembered = useRef<Partial<Record<Method, string>>>({});
  const selected = service.variants.find((row) => row.id === variant);
  const method = selected ? installationMethod(selected) : '';
  const installed =
    Boolean(service.observation?.installed) || ['running', 'stopped'].includes(service.state);
  const rows = service.variants.filter((row) => installationMethod(row) === method);
  return (
    <Field>
      <FieldLabel id={`${id}-label`}>Installation method</FieldLabel>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        className="grid gap-3 sm:grid-cols-2"
        value={method}
        onValueChange={(value) => {
          if (method) remembered.current[method] = variant;
          const prior = remembered.current[value as Method];
          const next =
            service.variants.find((row) => row.id === prior && row.compatible) ??
            service.variants.find((row) => installationMethod(row) === value && row.compatible);
          if (next) onVariant(next.id);
        }}
      >
        {methods(service).map((kind) => {
          const choices = service.variants.filter((row) => installationMethod(row) === kind);
          const available = choices.some((row) => row.compatible);
          return (
            <label
              key={kind}
              htmlFor={`${id}-${kind}`}
              className="flex items-start gap-2 py-1 text-sm"
            >
              <RadioGroupItem
                id={`${id}-${kind}`}
                value={kind}
                disabled={installed || !available}
                className="mt-0.5"
              />
              <span>
                <span className={available ? 'font-medium' : 'font-medium text-muted-foreground'}>
                  {labels[kind]}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {available
                    ? kind === 'native'
                      ? 'Runs directly on this computer'
                      : 'Uses a container runtime on this computer'
                    : choices.length
                      ? 'Unavailable on this computer'
                      : 'No managed installer for this service'}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
      {rows.length > 1 ? (
        <Select onValueChange={onVariant} value={variant} disabled={installed}>
          <SelectTrigger aria-label={`${service.label} ${method ? labels[method] : ''} variant`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rows.map((row) => (
              <SelectItem key={row.id} value={row.id} disabled={!row.compatible}>
                {row.label} · {row.version}
                {row.compatible ? '' : ' (unavailable)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : selected ? (
        <p className="text-xs text-muted-foreground">
          {selected.label} · {selected.version}
        </p>
      ) : null}
      {selected?.install_type === 'supervised_stack' ? (
        <p className="text-xs text-muted-foreground">
          The application runs natively; its databases require containers.
        </p>
      ) : null}
      {selected && !selected.compatible ? (
        <p className="text-sm text-warning-foreground">{selected.reason}</p>
      ) : null}
      {installed ? (
        <p className="text-xs text-muted-foreground">
          This installation keeps its recorded method. Remove its runtime before choosing another.
        </p>
      ) : null}
      {service.variants.some((row) => !row.compatible) ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Unavailable options</summary>
          <ul className="mt-2 space-y-1">
            {service.variants
              .filter((row) => !row.compatible)
              .map((row) => (
                <li key={row.id}>
                  {labels[installationMethod(row)]} · {row.label}: {row.reason}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </Field>
  );
}
