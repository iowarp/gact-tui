import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { ClioA2UISurface } from './a2ui-surface';
import { useQuestionAnswer } from './question-answer-context';
import { Button } from '@/components/ui/button';
import { useContext } from 'react';
import { ResponseViewportContext } from './response-viewport-context';

export function QuestionSurface({ interaction }: { interaction: PendingInteraction }) {
  const state = useQuestionAnswer();
  const id = interaction.source.surface_id;
  if (!id) return null;
  const surface =
    state?.surfaces?.[`${interaction.owner_session_id}:${id}`] ?? state?.surfaces?.[id];
  if (!surface || surface.session_id !== interaction.owner_session_id)
    return (
      <div role="status" className="mb-3 text-sm text-muted-foreground">
        Question visual is unavailable.
        {state?.refetchSurfaces ? (
          <Button variant="ghost" size="sm" onClick={state.refetchSurfaces}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  return (
    <RenderedQuestionSurface
      surface={surface}
      questionId={String(interaction.payload?.question_id ?? '')}
    />
  );
}

function RenderedQuestionSurface({
  surface,
  questionId,
}: {
  surface: A2UISurface;
  questionId: string;
}) {
  const viewport = useContext(ResponseViewportContext);
  const repository = useRepository();
  const queries = useQueryClient();
  return (
    <div className="mb-3 min-w-0 overflow-auto" data-slot="question-a2ui">
      <ClioA2UISurface
        surface={surface}
        viewport={viewport}
        onRemoteAction={async (message) => {
          await repository.a2uiAction(surface.session_id, message, {
            run_id: surface.run_id,
            message_id: surface.message_id,
            part_id: surface.part_id,
            question_id: questionId,
          });
          await queries.invalidateQueries({
            predicate: (query) =>
              query.queryKey.includes('pending-interactions') ||
              query.queryKey.includes('pending-questions'),
          });
        }}
      />
    </div>
  );
}
