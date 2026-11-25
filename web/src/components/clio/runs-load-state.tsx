import type { ReactNode } from 'react';
import { StateView } from '@/components/clio/primitives/state-view';
import { TechnicalDetails } from '@/components/clio/technical-details';
import { vocab } from '@/lib/brand-vocabulary';
import { ph, t } from '@lingui/core/macro';

/** A request that never reached the service, as the transport reports it. */
function isNetworkFailure(error: Error): boolean {
  return (error as { code?: unknown }).code === 'network_unavailable';
}

/**
 * Why the run list is not showing yet: an error in words, a wait that stopped,
 * a stalled or unreachable read with a retry and a way to stop waiting, or the
 * plain loading line. Nothing once the list has arrived.
 */
export function runsLoadState({
  error,
  loading,
  stoppedWaiting,
  unreachable,
  stalled,
  flows,
  onRefresh,
  onRetry,
  onStopWaiting,
}: {
  error: Error | null | undefined;
  loading: boolean;
  stoppedWaiting: boolean;
  unreachable: boolean;
  stalled: boolean;
  flows: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  onStopWaiting: () => void;
}): ReactNode | undefined {
  if (error) {
    const offline = unreachable || isNetworkFailure(error);
    // The person reads why in words; the service's own message and address are technical detail.
    return (
      <StateView
        action={{ label: t`Retry`, onClick: onRefresh }}
        detail={
          offline
            ? t`Check that it's running, then retry. Runs appear once it answers.`
            : t`The ${ph({ agent: vocab.agent })} answered with an error. Retry in a moment.`
        }
        kind="error"
        title={
          offline
            ? t`Can't reach the ${ph({ agent: vocab.agent })}`
            : flows
              ? t`Flows couldn't be loaded`
              : t`Runs couldn't be loaded`
        }
      >
        <TechnicalDetails className="mt-1 text-meta" title={t`Technical details`}>
          <p className="mt-1 font-mono text-label break-all text-muted-foreground">
            {error.message}
          </p>
        </TechnicalDetails>
      </StateView>
    );
  }
  if (!loading) return undefined;
  if (stoppedWaiting)
    return (
      <StateView
        action={{ label: t`Retry`, onClick: onRetry }}
        detail={unreachable ? t`The ${ph({ agent: vocab.agent })} can't be reached.` : undefined}
        kind="unavailable"
        title={t`Stopped waiting for runs`}
      />
    );
  if (unreachable || stalled)
    return (
      <StateView
        action={{ label: t`Retry now`, onClick: onRetry }}
        detail={
          unreachable
            ? t`Runs appear once it answers.`
            : t`The ${ph({ agent: vocab.agent })} hasn't answered yet.`
        }
        kind="loading"
        secondaryAction={{ label: t`Stop waiting`, onClick: onStopWaiting }}
        title={
          unreachable
            ? t`Can't reach the ${ph({ agent: vocab.agent })}, retrying`
            : t`Runs are taking longer than usual`
        }
      />
    );
  return <StateView kind="loading" title={flows ? t`Loading flows` : t`Loading runs`} />;
}
