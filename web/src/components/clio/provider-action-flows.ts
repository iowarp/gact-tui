import type { ProviderActionStage } from './provider-actions';

/** Which flow a running action belongs to; each has its own steps. */
export type ProviderActionFlow = 'api_key' | 'sign_in' | 'install' | 'check';

interface FlowStep {
  title: string;
  /** The action stages that mean this step is the one running. */
  stages: readonly ProviderActionStage[];
  /** A stage that names its provider ("Verifying GitHub Copilot…") matches by its start. */
  prefix?: string;
}

export const FLOW_STEPS: Record<ProviderActionFlow, readonly FlowStep[]> = {
  api_key: [
    { title: 'Saving your key', stages: ['Saving your key…'] },
    { title: 'Checking your key', stages: ['Checking…'] },
    { title: 'Finding models', stages: ['Finding models…'] },
  ],
  sign_in: [
    {
      title: 'Logging in',
      stages: ['Opening sign-in…', 'Waiting for you to log in…', 'Logging in…'],
    },
    { title: 'Verifying', stages: [], prefix: 'Verifying ' },
    { title: 'Loading models', stages: ['Loading models…'] },
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
export function providerActionStep(flow: ProviderActionFlow, stage: ProviderActionStage): number {
  return (
    FLOW_STEPS[flow].findIndex(
      (step) => step.stages.includes(stage) || (step.prefix && stage.startsWith(step.prefix)),
    ) + 1
  );
}

/**
 * The flow a stage belongs to. A sign-in's last steps run after the provider
 * already reports signed in, when its own state would pick another flow.
 */
export function providerActionStageFlow(
  flow: ProviderActionFlow,
  stage: ProviderActionStage,
): ProviderActionFlow {
  if (providerActionStep(flow, stage)) return flow;
  return (
    (Object.keys(FLOW_STEPS) as ProviderActionFlow[]).find((other) =>
      providerActionStep(other, stage),
    ) ?? flow
  );
}

/**
 * A running stage as one short word for a provider row ("Verifying…",
 * "Loading models…"): the title of the step it belongs to. The plain
 * checks come first so "Checking…" stays "Checking…".
 */
export function providerActionStageWord(stage: string): string {
  for (const flow of ['check', 'sign_in', 'install', 'api_key'] as const) {
    const step = providerActionStep(flow, stage as ProviderActionStage);
    if (step) return `${FLOW_STEPS[flow][step - 1].title}…`;
  }
  return stage;
}
