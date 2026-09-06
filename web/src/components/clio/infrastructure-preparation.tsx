import type { InfrastructureDependency } from '@clio/core/v3';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { infrastructurePreparationLabel } from './infrastructure-preparation-label';

interface ClioInfrastructurePreparationProps {
  dependencies: readonly InfrastructureDependency[];
}

/** AI Elements shimmer treatment for the current pre-response startup phase. */
export function ClioInfrastructurePreparation({
  dependencies,
}: ClioInfrastructurePreparationProps) {
  return (
    <Shimmer as="span" className="min-w-0 flex-1 truncate text-left font-medium" duration={1.5}>
      {infrastructurePreparationLabel(dependencies)}
    </Shimmer>
  );
}
