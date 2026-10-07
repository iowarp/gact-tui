import type { InfrastructureDependency } from '@clio/core/v3';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { useReducedMotionConfig } from 'motion/react';
import { infrastructurePreparationLabel } from './infrastructure-preparation-label';

interface ClioInfrastructurePreparationProps {
  dependencies: readonly InfrastructureDependency[];
  followUp?: boolean;
}

/** AI Elements shimmer treatment for the current pre-response startup phase. */
export function ClioInfrastructurePreparation({
  dependencies,
  followUp = false,
}: ClioInfrastructurePreparationProps) {
  const reducedMotion = useReducedMotionConfig();
  if (reducedMotion)
    return (
      <span className="font-medium">{infrastructurePreparationLabel(dependencies, followUp)}</span>
    );
  return (
    <Shimmer as="span" className="min-w-0 flex-1 truncate text-left font-medium" duration={1.5}>
      {infrastructurePreparationLabel(dependencies, followUp)}
    </Shimmer>
  );
}
