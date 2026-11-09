import type { PromptDefinition } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { BellIcon } from 'lucide-react';
import { EditIcon } from '@/lib/icon-vocabulary';
import type { KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { reminderMeta, type ReminderMeta } from '@/lib/reminder-meta';
import { MetaLine } from './extension-parts';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';

function metaParts(prompt: PromptDefinition, meta: ReminderMeta) {
  const params = Object.entries(meta.params).map(([name, value]) => `${name} = ${value}`);
  return [
    meta.trigger ? `When ${meta.trigger}` : (prompt.description ?? ''),
    params.join(', '),
    { text: meta.variables.map((name) => `{{${name}}}`).join(' '), mono: true },
  ];
}

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
    onError: () => toast.error('The reminder wasn’t changed. Try again.'),
  });
  const reminders = prompts.flatMap((prompt) => {
    const meta = reminderMeta(prompt);
    return meta ? [{ prompt, meta }] : [];
  });
  if (!reminders.length)
    return (
      <ItemList label="Reminders">
        <StateView kind="empty" size="row" title="This service reports no reminders" />
      </ItemList>
    );
  return (
    <ItemList label="Reminders">
      {reminders.map(({ prompt, meta }) => {
        const name = prompt.title || prompt.id;
        const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.target !== event.currentTarget || event.key !== 'Enter') return;
          event.preventDefault();
          onEdit(prompt);
        };
        return (
          <ItemRow
            actions={
              <IconButton
                icon={<EditIcon />}
                label={`Edit ${name}`}
                onClick={() => onEdit(prompt)}
              />
            }
            actionsWidth={30}
            icon={<BellIcon />}
            key={prompt.id}
            meta={<MetaLine parts={metaParts(prompt, meta)} />}
            onClick={(event) => {
              if ((event.target as Element).closest('button, [role="switch"]')) return;
              onEdit(prompt);
            }}
            onKeyDown={onKeyDown}
            slot={
              meta.required ? null : (
                <Switch
                  aria-label={`${name} on`}
                  checked={meta.active}
                  disabled={toggle.isPending}
                  onCheckedChange={(active) => toggle.mutate({ prompt, active })}
                />
              )
            }
            slotWidth={44}
            status={
              <span
                className="flex min-w-0"
                title={meta.required ? `Cannot be turned off: ${meta.required}` : undefined}
              >
                <StatusIndicator
                  label={meta.required ? 'Always on' : meta.active ? 'On' : 'Off'}
                  tone={meta.active ? 'success' : 'idle'}
                />
              </span>
            }
            statusWidth={96}
            tabIndex={0}
            title={name}
          />
        );
      })}
    </ItemList>
  );
}
