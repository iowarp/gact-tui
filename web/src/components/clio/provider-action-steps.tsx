import { CheckIcon, LoaderCircleIcon } from 'lucide-react';
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
} from '@/components/reui/stepper';
import type { ProviderActionStage } from './provider-actions';
import {
  FLOW_STEPS,
  providerActionStageFlow,
  providerActionStep,
  type ProviderActionFlow,
} from './provider-action-flows';

/**
 * A running provider action as its steps ("Saving your key", "Checking your
 * key", "Finding models"), driven by the shared action hook's live stage --
 * done steps ticked, the current one spinning. Display only: the steps are
 * not buttons, so the list carries no tab stops.
 */
export function ProviderActionSteps({
  flow,
  stage,
}: {
  flow: ProviderActionFlow;
  stage: ProviderActionStage;
}) {
  const shown = providerActionStageFlow(flow, stage);
  const steps = FLOW_STEPS[shown];
  const current = Math.max(providerActionStep(shown, stage), 1);
  return (
    <div
      aria-live="polite"
      className="@container w-full"
      data-slot="provider-action-steps"
      role="status"
    >
      <span className="sr-only">{stage}</span>
      <Stepper
        aria-hidden="true"
        indicators={{
          completed: <CheckIcon className="size-3" />,
          loading: <LoaderCircleIcon className="size-3 animate-spin" />,
        }}
        value={current}
      >
        <StepperNav className="gap-2">
          {steps.map((step, index) => (
            <StepperItem
              className="gap-2 not-last:flex-1"
              key={step.title}
              loading={index + 1 === current}
              step={index + 1}
              title={step.title}
            >
              <StepperIndicator className="size-5 data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground">
                {index + 1}
              </StepperIndicator>
              <StepperTitle className="text-xs font-normal whitespace-nowrap data-[state=inactive]:text-muted-foreground @max-[27rem]:not-data-[state=active]:hidden">
                {step.title}
              </StepperTitle>
              {index < steps.length - 1 ? <StepperSeparator className="min-w-3" /> : null}
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>
    </div>
  );
}
