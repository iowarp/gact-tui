import type { Message, PendingInteraction } from '@clio/core/v3';
import { useContext, useMemo } from 'react';
import { variantRunsForMessage, variantRunView } from '@/lib/variant-runs';
import { useLiveStore } from '@/store/live-store';
import { PresentationNavigation } from './presentation-navigation';
import { VariantTabsBlock } from './variant-tabs-block';

const NO_INTERACTIONS: readonly PendingInteraction[] = [];
const NO_MESSAGES: readonly Message[] = [];

/**
 * The variant runs (draft tabs) that belong at one assistant message. It reads
 * the runs from the live store and the conversation's messages, interactions
 * and answer route from the conversation context, so a streaming try repaints
 * its tab without re-rendering the (memoized) message row around it.
 */
export function VariantRunsForMessage({ message }: { message: Message }) {
  const navigation = useContext(PresentationNavigation);
  const variantRuns = useLiveStore((state) => state.entities.variant_runs);
  const messages = navigation?.messages ?? NO_MESSAGES;
  const interactions = navigation?.interactions ?? NO_INTERACTIONS;
  const onResponse = navigation?.onInteractionResponse;
  const runs = useMemo(
    () => variantRunsForMessage(Object.values(variantRuns ?? {}), message, messages),
    [message, messages, variantRuns],
  );
  if (runs.length === 0) return null;
  return (
    <div className="my-2 flex min-w-0 flex-col gap-3" data-slot="variant-runs">
      {runs.map((run) => {
        const view = variantRunView(run, interactions, messages);
        const interaction = view.pick?.interaction;
        return (
          <VariantTabsBlock
            key={run.variants_id}
            onPick={
              interaction && onResponse
                ? (candidateId, comment) =>
                    onResponse(interaction, {
                      action: 'answer',
                      selected_options: [candidateId],
                      ...(comment ? { answer: comment } : {}),
                    })
                : undefined
            }
            view={view}
          />
        );
      })}
    </div>
  );
}
