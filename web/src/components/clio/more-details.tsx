import { withMark } from '@/lib/composer-annotations';
import type { ComposerDraft } from '@/hooks/use-composer-draft';
import { useMoreDetails } from '@/hooks/use-more-details';
import { ClioMoreDetailsPanel } from './more-details-panel';


/**
 * "More details" for the open session: registers the selection action and
 * renders its side panel. An aside answer reaches the main chat only through
 * "Add answer to chat", as a quote on the composer draft.
 */
export function ClioMoreDetails({
  composerDraft,
  focusComposer,
  model,
  provider,
  sessionId,
  workspaceId,
}: {
  composerDraft: Pick<ComposerDraft, 'annotations' | 'onAnnotationsChange'>;
  focusComposer: () => void;
  /** The parent session's model route; an aside answers on the same model. */
  model?: string;
  provider?: string;
  sessionId: string;
  workspaceId: string;
}) {
  const aside = useMoreDetails(
    sessionId,
    provider && model ? { provider_id: provider, model_id: model } : undefined,
  );
  return (
    <ClioMoreDetailsPanel
      onAddToChat={(text) => {
        composerDraft.onAnnotationsChange(
          withMark(composerDraft.annotations, 'agent-answer', 'a side answer', {
            profile: 'text-quote',
            exact: text,
            source: { session_id: aside.side?.id ?? sessionId },
          }),
        );
        aside.close();
        focusComposer();
      }}
      onAsk={aside.ask}
      onClose={aside.close}
      opening={aside.opening}
      selection={aside.selection}
      side={aside.side}
      workspaceId={workspaceId}
    />
  );
}
