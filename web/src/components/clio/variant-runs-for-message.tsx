import type { Message, PendingInteraction } from '@clio/core/v3';
import { useContext, useMemo } from 'react';
import { variantRunsForMessage, variantRunView } from '@/lib/variant-runs';
import { useLiveStore } from '@/store/live-store';
import { PresentationNavigation } from './presentation-navigation';
import { useTranscriptMessages } from './transcript-messages-context';
import { VariantRunRecord } from './variant-pick-card';

const NO_INTERACTIONS: readonly PendingInteraction[] = [];

/**
 * The variant runs that belong at one assistant message: the pick card while
 * a run waits for the user, otherwise one folded row; the tries themselves
 * open as workbench tabs. It reads the runs from the live store and the
 * conversation's messages, interactions and answer route from the
 * conversation context, so a streaming try never re-renders the (memoized)
 * message row around it.
 *
 * Every assistant row mounts this, and the transcript's messages change with
 * each streamed chunk. Only a row whose session has a variant run with tries
 * subscribes to them; the rest read one boolean from the store and stay still.
 */
export function VariantRunsForMessage({ message }: { message: Message }) {
  const candidate = useLiveStore((state) =>
    message.role === 'assistant'
      ? Object.values(state.entities.variant_runs ?? {}).some(
          (run) => run.session_id === message.session_id && run.tries.length > 0,
        )
      : false,
  );
  return candidate ? <AnchoredVariantRuns message={message} /> : null;
}

function AnchoredVariantRuns({ message }: { message: Message }) {
  const navigation = useContext(PresentationNavigation);
  const transcriptMessages = useTranscriptMessages();
  const variantRuns = useLiveStore((state) => state.entities.variant_runs);
  // An export passes its messages through the navigation; the live transcript
  // keeps them in their own context so links and hover cards stay still.
  const messages = navigation?.messages ?? transcriptMessages;
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
          <VariantRunRecord
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
