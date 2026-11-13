import type { SessionWork } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { planStatusLabel } from '@/lib/plan-status';
import { useConnectionSettings } from '@/providers/connection-provider';
import { t, ph } from '@lingui/core/macro';

/**
 * The session plan as the agent keeps it: its status, file and Markdown. Edit saves the
 * person's version; the agent receives it at its next step, marked as the person's edit.
 */
export function SessionPlanBody({
  plan,
  sessionId,
}: {
  plan: NonNullable<SessionWork['plan']>;
  sessionId: string;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: (content: string) => repository.saveSessionPlan(sessionId, content),
    onSuccess: async () => {
      setDraft(null);
      setSaved(true);
      await queryClient.invalidateQueries({
        queryKey: ['session-work', settings.endpoint, sessionId],
      });
    },
  });
  const name = plan.path.split(/[\\/]/).pop() ?? plan.path;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-slot="session-plan">
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={plan.path}>
          {planStatusLabel(plan.status)}, {name}
        </p>
        {draft === null ? (
          <Button
            className="h-auto p-0 text-xs"
            onClick={() => {
              setSaved(false);
              setDraft(plan.text);
            }}
            size="sm"
            variant="link"
          >
            {t`Edit plan`}
          </Button>
        ) : null}
      </div>
      {draft === null ? (
        <div className="min-w-0 text-sm">
          <MarkdownText mode="static">{plan.text}</MarkdownText>
        </div>
      ) : (
        <form
          className="flex min-w-0 flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) save.mutate(draft);
          }}
        >
          <Textarea
            aria-label={t`Plan`}
            className="min-h-48 font-mono text-xs"
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
          {save.error ? (
            <p role="alert" className="text-xs text-destructive">
              {t`The plan was not saved: ${ph({ message: save.error.message })}`}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDraft(null)} size="sm" type="button" variant="ghost">
              {t`Cancel`}
            </Button>
            <Button disabled={save.isPending || !draft.trim()} size="sm" type="submit">
              {save.isPending ? t`Saving…` : t`Save plan`}
            </Button>
          </div>
        </form>
      )}
      {saved ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t`Saved. The agent receives your edit at its next step.`}
        </p>
      ) : null}
    </div>
  );
}
