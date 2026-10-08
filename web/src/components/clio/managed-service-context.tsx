import type { ContextSizingSpec, ManagedServiceDefinition, ServerParameter } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ContextControl } from './context-control';
import {
  deploymentContextDraft,
  deploymentContextEntries,
  deploymentEffectiveContext,
} from './context-control-model';
import {
  PARAMETER_PREFIX,
  configurationForVariant,
  parametersForVariant,
} from './managed-service-target-utils';

/** How long the model field must stay unchanged before the host is asked to size it. */
const PREVIEW_DEBOUNCE_MS = 600;

/** The engine's context parameter when CLIO offers the sizing control for it. */
export function contextSizingParameter(
  service: ManagedServiceDefinition,
  variant: string,
): (ServerParameter & { context_sizing: ContextSizingSpec }) | undefined {
  return parametersForVariant(service.parameters ?? [], variant).find(
    (row): row is ServerParameter & { context_sizing: ContextSizingSpec } =>
      Boolean(row.context_sizing),
  );
}

/**
 * The context control of a managed model server's deployment form. Rendered
 * only for an engine whose catalog declares the control; its values come
 * from CLIO's preview of the model on the chosen host.
 */
export function ManagedServiceContextControl({
  service,
  variant,
  configuration,
  targetId = 'local',
  onConfiguration,
}: {
  service: ManagedServiceDefinition;
  variant: string;
  configuration: Record<string, string>;
  targetId?: string;
  onConfiguration: (field: string, value: string) => void;
}) {
  const parameter = contextSizingParameter(service, variant);
  if (!parameter) return null;
  return (
    <DeploymentContextControl
      configuration={configuration}
      onConfiguration={onConfiguration}
      parameter={parameter}
      service={service}
      targetId={targetId}
      variant={variant}
    />
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

function DeploymentContextControl({
  service,
  variant,
  configuration,
  targetId,
  onConfiguration,
  parameter,
}: {
  service: ManagedServiceDefinition;
  variant: string;
  configuration: Record<string, string>;
  targetId: string;
  onConfiguration: (field: string, value: string) => void;
  parameter: ServerParameter & { context_sizing: ContextSizingSpec };
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const spec = parameter.context_sizing;
  const parameterKey = `${PARAMETER_PREFIX}${parameter.id}`;
  const draft = deploymentContextDraft(configuration, spec, parameterKey);
  const model = useDebounced((configuration.model ?? '').trim(), PREVIEW_DEBOUNCE_MS);
  const share = configuration[spec.share_key] ?? '';
  const preview = useQuery({
    enabled: Boolean(model),
    queryKey: [
      'context-sizing-preview',
      settings.endpoint,
      targetId,
      service.id,
      variant,
      model,
      draft.strategy,
      share,
    ],
    queryFn: ({ signal }) => {
      // Ask for the default decision (with the chosen strategy and share): the
      // model's maximum and what Fit to GPU gives. The person's own number is
      // validated here, never sent half-typed.
      const {
        [parameterKey]: _typed,
        [spec.choice_key]: _choice,
        ...rest
      } = configurationForVariant(configuration, service.parameters ?? [], variant);
      return repository.previewContextSizing(
        service.id,
        { target_id: targetId, variant_id: variant, configuration: { ...rest, model } },
        signal,
      );
    },
    retry: false,
    staleTime: 30_000,
  });
  const controls = preview.data;
  const fitAvailable =
    spec.choices.includes('fit_to_gpu') &&
    (controls ? controls.fit_to_gpu.available : spec.fit_to_gpu_available);
  const strategies = controls?.fit_to_gpu.strategies.length
    ? controls.fit_to_gpu.strategies
    : spec.strategies;
  const installedDefault =
    controls && !draft.choice && controls.current !== undefined
      ? `Default: ${controls.current.toLocaleString('en-US')} tokens${
          controls.current_reason ? ` · ${controls.current_reason}` : ''
        }`
      : undefined;
  return (
    <div className="grid gap-1.5">
      <ContextControl
        allowMax={spec.choices.includes('max')}
        defaultDescription={installedDefault ?? (parameter.default_behavior || undefined)}
        draft={draft}
        effective={deploymentEffectiveContext(service.configuration)}
        fitToGpu={{
          available: fitAvailable,
          strategies,
          defaultStrategy: spec.default_strategy || controls?.fit_to_gpu.strategy,
          value: controls?.fit_to_gpu.value,
        }}
        id={`${service.id}-context`}
        ceiling={parameter.maximum}
        maximum={controls?.maximum}
        maximumReason={controls?.maximum_reason}
        minimum={controls?.minimum ?? parameter.minimum ?? 1}
        onDraft={(next) => {
          for (const [key, value] of Object.entries(
            deploymentContextEntries(next, spec, parameterKey),
          )) {
            onConfiguration(key, value);
          }
        }}
      />
      {preview.isFetching ? (
        <p className="text-xs text-muted-foreground" role="status">
          Reading the model and this host’s GPUs…
        </p>
      ) : preview.error ? (
        <p className="text-xs text-muted-foreground" role="status">
          Could not size the context yet: {preview.error.message}
        </p>
      ) : null}
    </div>
  );
}
