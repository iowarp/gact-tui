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

/** Which flow a running action belongs to; each has its own steps. */
export type ProviderActionFlow = 'api_key' | 'sign_in' | 'install' | 'check';

interface FlowStep {
  title: string;
  /** The action stages that mean this step is the one running. */
  stages: readonly ProviderActionStage[];
}

const FLOW_STEPS: Record<ProviderActionFlow, readonly FlowStep[]> = {
  api_key: [
    { title: 'Saving your key', stages: ['Saving your key…'] },
    { title: 'Checking your key', stages: ['Checking…'] },
    { title: 'Finding models', stages: ['Finding models…'] },
  ],
  sign_in: [
    { title: 'Opening sign-in', stages: ['Opening sign-in…'] },
    { title: 'Waiting for you', stages: ['Waiting for you to log in…', 'Logging in…'] },
    { title: 'Finding models', stages: ['Finding models…'] },
  ],
  install: [
    { title: 'Installing', stages: ['Installing…'] },
    { title: 'Checking', stages: ['Checking…'] },
    { title: 'Finding models', stages: ['Finding models…'] },
  ],
  check: [
    { title: 'Checking', stages: ['Checking…'] },
    { title: 'Finding models', stages: ['Finding models…'] },
  ],
};

/** The 1-based step a stage belongs to in a flow, or 0 when it is not one of its stages. */
function providerActionStep(flow: ProviderActionFlow, stage: ProviderActionStage): number {
  return FLOW_STEPS[flow].findIndex((step) => step.stages.includes(stage)) + 1;
}

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
  const steps = FLOW_STEPS[flow];
  const current = Math.max(providerActionStep(flow, stage), 1);
  return (
    <div aria-live="polite" data-slot="provider-action-steps" role="status">
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
            >
              <StepperIndicator className="size-5 data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground">
                {index + 1}
              </StepperIndicator>
              <StepperTitle className="text-xs font-normal whitespace-nowrap data-[state=inactive]:text-muted-foreground">
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
