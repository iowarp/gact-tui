import type { PluginPageStatus } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { formatDuration } from '@/lib/format';
import { StepList, type StepListStep, type StepState } from './primitives/step-list';
import { t } from '@lingui/core/macro';

/** How often an open in flight asks how far it has got. Unit: ms. */
const POLL_MS = 400;

const STEP_STATE: Record<PluginPageStatus['steps'][number]['state'], StepState> = {
  pending: 'todo',
  active: 'current',
  done: 'done',
  failed: 'failed',
  unknown: 'todo',
};

function stepLabel(id: string): string | undefined {
  switch (id) {
    case 'env':
      return t`Preparing the plugin's environment`;
    case 'server':
      return t`Starting the plugin's server`;
    case 'page':
      return t`Loading the page`;
    default:
      return undefined;
  }
}

/**
 * The steps of a plugin page's open while it is in flight: the plugin's
 * environment, its server, then the page. Shows nothing when the agent has
 * no status route or reports no steps.
 */
export function PluginOpenSteps({ pageId }: { pageId: string }) {
  const repository = useRepository();
  const status = useQuery({
    queryKey: ['plugin-page-status', pageId],
    queryFn: ({ signal }) => repository.pluginPageStatus(pageId, signal),
    refetchInterval: (query) => (query.state.status === 'error' ? false : POLL_MS),
    retry: false,
    gcTime: 0,
  });
  const steps: StepListStep[] = [];
  for (const step of status.data?.steps ?? []) {
    const label = stepLabel(step.id);
    if (!label) continue;
    const state = STEP_STATE[step.state];
    steps.push({
      id: step.id,
      label,
      state,
      meta:
        state === 'todo' || !step.elapsed_ms
          ? undefined
          : formatDuration(step.elapsed_ms, 'elapsed'),
    });
  }
  if (!steps.length) return null;
  return (
    <div className="mx-auto w-full max-w-80 min-w-0 text-left" data-slot="plugin-open-steps">
      <StepList label={t`Opening steps`} steps={steps} />
      {status.data?.error ? (
        <p className="mt-1 text-label text-pretty text-destructive" role="alert">
          {status.data.error}
        </p>
      ) : null}
    </div>
  );
}
