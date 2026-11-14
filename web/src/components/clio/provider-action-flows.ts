import { providerActionStageLabel, type ProviderActionStage } from './provider-actions';
import { t } from '@lingui/core/macro';

/** Which flow a running action belongs to; each has its own steps. */
export type ProviderActionFlow = 'api_key' | 'sign_in' | 'install' | 'check';

interface FlowStep {
  title: string;
  /** The step as one short running word for a provider row ("Verifying…"). */
  word: string;
  /** The action stages that mean this step is the one running. */
  stages: readonly ProviderActionStage[];
  /** A stage that names its provider (`verifying:GitHub Copilot`) matches by its start. */
  prefix?: string;
}

export const FLOW_STEPS: Record<ProviderActionFlow, readonly FlowStep[]> = {
  api_key: [
    { title: t`Saving your key`, word: t`Saving your key…`, stages: ['key-saving'] },
    { title: t`Checking your key`, word: t`Checking your key…`, stages: ['checking'] },
    { title: t`Finding models`, word: t`Finding models…`, stages: ['finding-models'] },
  ],
  sign_in: [
    {
      title: t`Logging in`,
      word: t`Logging in…`,
      stages: ['sign-in-opening', 'sign-in-waiting', 'logging-in'],
    },
    { title: t`Verifying`, word: t`Verifying…`, stages: [], prefix: 'verifying:' },
    { title: t`Loading models`, word: t`Loading models…`, stages: ['loading-models'] },
  ],
  install: [
    { title: t`Installing`, word: t`Installing…`, stages: ['install-waiting', 'installing'] },
    { title: t`Checking`, word: t`Checking…`, stages: ['checking'] },
    { title: t`Finding models`, word: t`Finding models…`, stages: ['finding-models'] },
  ],
  check: [
    { title: t`Checking`, word: t`Checking…`, stages: ['checking'] },
    { title: t`Finding models`, word: t`Finding models…`, stages: ['finding-models'] },
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
 * checks come first so "Checking…" stays "Checking…". A queued install keeps
 * its own word: it has not started installing yet.
 */
export function providerActionStageWord(stage: string): string {
  if (stage === 'install-waiting') return providerActionStageLabel(stage);
  for (const flow of ['check', 'sign_in', 'install', 'api_key'] as const) {
    const step = providerActionStep(flow, stage as ProviderActionStage);
    if (step) return FLOW_STEPS[flow][step - 1].word;
  }
  return providerActionStageLabel(stage);
}
