import type { EffectiveParameter, OwnedResource, ServerParameter } from '@clio/core/v3';
import { Badge } from '@/components/reui/badge';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PARAMETER_PREFIX, parametersForVariant } from './managed-service-target-utils';

/**
 * The server-side knobs of a model runtime, rendered verbatim from the
 * declaration CLIO sends. An empty field keeps the engine's own default, which
 * is shown as the placeholder.
 */
export function ServerParametersForm({
  parameters,
  serviceLabel,
  values,
  variant,
  onChange,
}: {
  parameters: ServerParameter[];
  serviceLabel: string;
  values: Record<string, string>;
  variant: string;
  onChange: (key: string, value: string) => void;
}) {
  // The context parameter, when CLIO offers its sizing control, is rendered by
  // ManagedServiceContextControl (number / Max / Fit to GPU) instead.
  const rows = parametersForVariant(parameters, variant).filter((row) => !row.context_sizing);
  if (!rows.length) return null;
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
        Server parameters
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Leave a field empty to keep the engine&rsquo;s default. After it starts, the values actually
        in force are shown here.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {rows.map((row) => {
          const key = `${PARAMETER_PREFIX}${row.id}`;
          const id = `server-parameter-${row.id}`;
          return (
            <Field key={row.id}>
              <FieldLabel htmlFor={id}>{row.label}</FieldLabel>
              {row.kind === 'choice' ? (
                <Select onValueChange={(value) => onChange(key, value)} value={values[key] ?? ''}>
                  <SelectTrigger aria-label={`${serviceLabel} ${row.label}`} id={id}>
                    <SelectValue placeholder={row.default_behavior || 'Engine default'} />
                  </SelectTrigger>
                  <SelectContent>
                    {row.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  aria-label={`${serviceLabel} ${row.label}`}
                  id={id}
                  inputMode={row.kind === 'text' ? 'text' : 'decimal'}
                  max={row.maximum}
                  min={row.minimum}
                  onChange={(event) => onChange(key, event.target.value)}
                  placeholder={row.default_behavior || 'Engine default'}
                  step={row.kind === 'integer' ? 1 : 'any'}
                  type={row.kind === 'text' ? 'text' : 'number'}
                  value={values[key] ?? ''}
                />
              )}
              <FieldDescription>
                {row.description} <span className="font-mono">{row.name}</span>
              </FieldDescription>
            </Field>
          );
        })}
      </div>
    </details>
  );
}

const SOURCE_LABELS: Record<
  EffectiveParameter['source'],
  { label: string; variant: 'success-light' | 'info-light' | 'outline' | 'secondary' }
> = {
  server_report: { label: 'Reported by the server', variant: 'success-light' },
  container_config: { label: 'Container launch', variant: 'info-light' },
  launch_request: { label: 'As launched', variant: 'outline' },
  engine_default: { label: 'Engine default', variant: 'secondary' },
};

/** What the running server has in force, each value labelled with where it came from. */
export function EffectiveParameters({
  rows,
  serviceLabel,
}: {
  rows: EffectiveParameter[];
  serviceLabel: string;
}) {
  if (!rows.length) return null;
  return (
    <section aria-label={`${serviceLabel} parameters in force`} className="border-y">
      <header className="flex items-center justify-between gap-3 border-b bg-muted/25 px-3 py-2">
        <p className="text-xs font-medium text-foreground">In force on the server</p>
      </header>
      <dl className="divide-y">
        {rows.map((row) => {
          const source = SOURCE_LABELS[row.source];
          return (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2"
              key={row.id}
              title={row.detail}
            >
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="font-mono text-sm tabular-nums text-foreground">{row.value}</dd>
              <dd className="col-span-2">
                <Badge size="sm" variant={source.variant}>
                  {source.label}
                </Badge>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

const RESOURCE_LABELS: Record<OwnedResource['kind'], string> = {
  container: 'Container',
  image: 'Image',
  directory: 'Directory',
  parent_directory: 'Directory (removed if empty)',
  instance_logs: 'Instance logs',
};

/** Everything this deployment created on its host; uninstall removes exactly these. */
export function OwnedResources({
  rows,
  serviceLabel,
  retained = false,
}: {
  rows: OwnedResource[];
  serviceLabel: string;
  retained?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
        Created on this host ({rows.length})
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {retained
          ? 'Removing the runtime retains these folders. Delete retained data is a separate action.'
          : 'Uninstall removes these and nothing else.'}
      </p>
      <ul aria-label={`${serviceLabel} created resources`} className="mt-2 space-y-1">
        {rows.map((row) => (
          <li
            className="grid gap-x-3 text-xs sm:grid-cols-[14rem_minmax(0,1fr)]"
            key={`${row.kind}:${row.ref}`}
          >
            <span className="text-muted-foreground">{RESOURCE_LABELS[row.kind]}</span>
            <span className="break-all font-mono text-foreground">{row.ref}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
