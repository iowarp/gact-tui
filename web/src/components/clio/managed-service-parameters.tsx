import type {
  EffectiveParameter,
  GpuFact,
  OwnedResource,
  ServerParameter,
} from '@clio/core/v3';
import { useRef } from 'react';
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
import { GpuDevicePicker } from './managed-service-gpu-picker';
import { gpusForParameter, isDeviceParameter, parseDevices } from './managed-service-gpus';
import { PARAMETER_PREFIX, parametersForVariant } from './managed-service-target-utils';

const TENSOR_PARALLEL = `${PARAMETER_PREFIX}tensor_parallel_size`;
const PIPELINE_PARALLEL = `${PARAMETER_PREFIX}pipeline_parallel_size`;
/** llama.cpp's multi-GPU controls: meaningless when the server sees one GPU. */
const MULTI_GPU_PARAMETERS = new Set(['split_mode', 'tensor_split', 'main_gpu']);

/**
 * The server-side knobs of a model runtime, rendered verbatim from the
 * declaration CLIO sends. An empty field keeps the engine's own default, which
 * is shown as the placeholder. When the host reported its GPUs, a `*_devices`
 * parameter is a choice of those GPUs instead of a text field.
 */
export function ServerParametersForm({
  parameters,
  serviceLabel,
  values,
  variant,
  onChange,
  gpus = [],
}: {
  parameters: ServerParameter[];
  serviceLabel: string;
  values: Record<string, string>;
  variant: string;
  onChange: (key: string, value: string) => void;
  /** The host's GPUs; empty (an older server, or none) keeps the plain text fields. */
  gpus?: GpuFact[];
}) {
  // The tensor parallel size this form last filled in from the GPU choice;
  // any other value was typed by the person and is left alone.
  const prefilled = useRef<string | undefined>(undefined);
  // The context parameter, when CLIO offers its sizing control, is rendered by
  // ManagedServiceContextControl (number / Max / Fit to GPU) instead.
  const declared = parametersForVariant(parameters, variant).filter((row) => !row.context_sizing);
  const pickers = declared.filter(
    (row) => isDeviceParameter(row) && gpusForParameter(row, gpus).length > 0,
  );
  const device = pickers[0];
  const selected = device ? parseDevices(values[`${PARAMETER_PREFIX}${device.id}`]).length : 0;
  const visible = device ? selected || gpusForParameter(device, gpus).length : undefined;
  const rows = declared.filter(
    (row) =>
      !pickers.includes(row) &&
      !(visible !== undefined && visible <= 1 && MULTI_GPU_PARAMETERS.has(row.id)),
  );
  const tensorParallel = declared.some((row) => row.id === 'tensor_parallel_size');
  const pipelineParallel = declared.some((row) => row.id === 'pipeline_parallel_size');
  const chooseDevices = (key: string, value: string) => {
    onChange(key, value);
    if (!tensorParallel) return;
    const current = values[TENSOR_PARALLEL] ?? '';
    if (current && current !== prefilled.current) return;
    const count = parseDevices(value).length;
    const next = count ? String(count) : '';
    prefilled.current = next;
    if (next !== current) onChange(TENSOR_PARALLEL, next);
  };
  const tp = Number(values[TENSOR_PARALLEL]) || 1;
  const pp = pipelineParallel ? Number(values[PIPELINE_PARALLEL]) || 1 : 1;
  const mismatch = Boolean(device && tensorParallel && selected && tp * pp !== selected);
  if (!rows.length && !pickers.length) return null;
  return (
    <>
      {pickers.length ? (
        <section aria-label={`${serviceLabel} GPUs`} className="grid gap-4 sm:grid-cols-2">
          {pickers.map((row) => {
            const key = `${PARAMETER_PREFIX}${row.id}`;
            return (
              <GpuDevicePicker
                gpus={gpusForParameter(row, gpus)}
                key={row.id}
                onChange={(value) => chooseDevices(key, value)}
                parameter={row}
                serviceLabel={serviceLabel}
                value={values[key] ?? ''}
              />
            );
          })}
          {mismatch ? (
            <p className="text-xs text-warning-foreground sm:col-span-2" role="status">
              Tensor parallel size × pipeline parallel size is {tp} × {pp} = {tp * pp}, but{' '}
              {selected} {selected === 1 ? 'GPU is' : 'GPUs are'} selected. vLLM needs them to
              match.
            </p>
          ) : null}
        </section>
      ) : null}
      {rows.length ? (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Server parameters
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Leave a field empty to keep the engine&rsquo;s default. After it starts, the values
            actually in force are shown here.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {rows.map((row) => {
              const key = `${PARAMETER_PREFIX}${row.id}`;
              const id = `server-parameter-${row.id}`;
              return (
                <Field key={row.id}>
                  <FieldLabel htmlFor={id}>{row.label}</FieldLabel>
                  {row.kind === 'choice' ? (
                    <Select
                      onValueChange={(value) => onChange(key, value)}
                      value={values[key] ?? ''}
                    >
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
      ) : null}
    </>
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
