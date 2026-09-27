import type { ComposerDraft } from '@/hooks/use-composer-draft';
import { useMoreDetails } from '@/hooks/use-more-details';
import { ClioMoreDetailsPanel } from './more-details-panel';

let asideAnnotationSequence = 0;

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
        asideAnnotationSequence += 1;
        composerDraft.onAnnotationsChange([
          ...composerDraft.annotations,
          {
            id: `aside-answer-${Date.now().toString(36)}-${asideAnnotationSequence}`,
            kind: 'text-quote',
            text,
            sessionId: aside.side?.id ?? sessionId,
            messageId: '',
          },
        ]);
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
