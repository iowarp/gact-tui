import type { PromptDefinition } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { reminderMeta } from '@/lib/reminder-meta';
import { ClioInteractiveRow } from './interactive-row';

/** Reminders CLIO adds to what the agent reads: each can be switched off or edited. */
export function RemindersList({
  prompts,
  onEdit,
  onChanged,
}: {
  prompts: PromptDefinition[];
  onEdit: (prompt: PromptDefinition) => void;
  onChanged: () => void;
}) {
  const repository = useRepository();
  const toggle = useMutation({
    mutationFn: async ({ prompt, active }: { prompt: PromptDefinition; active: boolean }) => {
      const profile = prompt.default_profile || 'default';
      const current = await repository.prompt(prompt.id, { profile });
      return repository.savePrompt(prompt.id, {
        scope: 'global',
        profile,
        text: current.text,
        title: current.title || prompt.title,
        description: current.description ?? prompt.description,
        metadata: { ...current.metadata, active },
      });
    },
    onSuccess: (_result, { active }) => {
      toast.success(active ? 'Reminder turned on' : 'Reminder turned off');
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });
  const reminders = prompts.flatMap((prompt) => {
    const meta = reminderMeta(prompt);
    return meta ? [{ prompt, meta }] : [];
  });
  if (!reminders.length)
    return (
      <p className="p-5 text-sm text-muted-foreground">
        This server reports no reminders. Update the agent to edit them here.
      </p>
    );
  return (
    <div className="grid gap-1">
      {reminders.map(({ prompt, meta }) => (
        <ClioInteractiveRow key={prompt.id} onClick={() => onEdit(prompt)} role="button">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{prompt.title || prompt.id}</p>
                <Badge variant="outline">{meta.active ? 'On' : 'Off'}</Badge>
                <Badge variant="outline">{prompt.scope}</Badge>
              </div>
              {prompt.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{prompt.description}</p>
              ) : null}
              {meta.trigger ? (
                <p className="mt-1 text-xs text-muted-foreground">When: {meta.trigger}</p>
              ) : null}
              {meta.variables.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Variables: {meta.variables.map((name) => `{{${name}}}`).join(', ')}
                </p>
              ) : null}
            </div>
            <Switch
              aria-label={`${prompt.title || prompt.id} on`}
              checked={meta.active}
              disabled={toggle.isPending}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(active) => toggle.mutate({ prompt, active })}
            />
          </div>
        </ClioInteractiveRow>
      ))}
    </div>
  );
}
