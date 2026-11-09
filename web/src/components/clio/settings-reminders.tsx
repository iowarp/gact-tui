import type { PromptDefinition } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { BellIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { reminderMeta } from '@/lib/reminder-meta';
import { ItemList, ItemRow } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';
import { plainReason } from './settings-health-reason';

/** Reminders CLIO adds to what the agent reads: each can be switched off or edited. */
export function RemindersList({
  prompts,
  onEdit,
  onChanged,
  openId,
}: {
  prompts: PromptDefinition[];
  onEdit: (prompt: PromptDefinition) => void;
  onChanged: () => void;
  openId?: string;
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
    onError: (error) =>
      toast.error('Could not change this reminder', { description: plainReason(error) }),
  });
  const reminders = prompts.flatMap((prompt) => {
    const meta = reminderMeta(prompt);
    return meta ? [{ prompt, meta }] : [];
  });
  if (!reminders.length)
    return (
      <StateView
        detail="Update the agent to edit them here."
        kind="empty"
        size="row"
        title="This server reports no reminders."
      />
    );
  return (
    <ItemList label="Reminders">
      {reminders.map(({ prompt, meta }) => {
        const title = prompt.title || prompt.id;
        const settings = Object.entries(meta.params)
          .map(([name, value]) => `${name} = ${value}`)
          .join(', ');
        const details = [
          meta.trigger ? `When: ${meta.trigger}` : '',
          meta.required ? `Cannot be turned off: ${meta.required}` : '',
          settings ? `Settings: ${settings}` : '',
          meta.variables.length
            ? `Variables: ${meta.variables.map((name) => `{{${name}}}`).join(', ')}`
            : '',
        ].filter(Boolean);
        const open = () => onEdit(prompt);
        return (
          <ItemRow
            aria-expanded={openId === prompt.id}
            className="cursor-pointer"
            icon={<BellIcon />}
            key={prompt.id}
            meta={
              details.length ? (
                <span title={[prompt.description, ...details].filter(Boolean).join('\n')}>
                  {details.map((line) => (
                    <span className="mr-2.5" key={line}>
                      {line}
                    </span>
                  ))}
                </span>
              ) : (
                prompt.description
              )
            }
            onClick={open}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              open();
            }}
            role="button"
            selected={openId === prompt.id}
            slot={
              meta.required ? (
                <span />
              ) : (
                <Switch
                  aria-label={`${title} on`}
                  checked={meta.active}
                  disabled={toggle.isPending}
                  onCheckedChange={(active) => toggle.mutate({ prompt, active })}
                  onClick={(event) => event.stopPropagation()}
                />
              )
            }
            slotWidth={48}
            status={
              <StatusIndicator
                label={meta.required ? 'Always on' : meta.active ? 'On' : 'Off'}
                tone={meta.required || meta.active ? 'success' : 'stopped'}
              />
            }
            statusWidth={96}
            tabIndex={0}
            title={title}
          />
        );
      })}
    </ItemList>
  );
}
