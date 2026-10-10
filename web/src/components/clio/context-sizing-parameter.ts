import type { ContextSizingSpec, ManagedServiceDefinition, ServerParameter } from '@clio/core/v3';
import { parametersForVariant } from './managed-service-target-utils';

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
