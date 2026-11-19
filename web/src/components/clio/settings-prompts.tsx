import { workspaceName } from '@/lib/workspace-labels';
import { queryKeys } from '@/lib/query-keys';
import { TransportError, type CommandDefinition, type PromptDefinition } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellIcon, FileTextIcon, FolderIcon, ScrollTextIcon, SquareSlashIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { narrowerThan, useElementWidth } from '@/hooks/use-element-width';
import { useRepository } from '@/hooks/use-repository';
import { commandGroups, commandSource } from '@/lib/command-table';
import { newItemKey } from '@/lib/settings-row-keys';
import { cn } from '@/lib/utils';
import { AddIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { reminderMeta } from '@/lib/reminder-meta';
import { useConnectionSettings } from '@/providers/connection-provider';
import { MetaLine } from './extension-parts';
import { DetailPane, ListDetailLayout } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow, type ItemRowProps } from './primitives/item-row';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { SegmentedControl } from './primitives/segmented-control';
import { StateView } from './primitives/state-view';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { PromptEditorDialog } from './settings-prompt-editor';
import { scopeLabel } from './settings-prompt-scope';
import { RemindersList } from './settings-reminders';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { plural, t, ph } from '@lingui/core/macro';

type View = 'prompts' | 'reminders' | 'commands';

const INFO = t`Inspect the instructions, reminders and commands the service supplies. Built-ins are read-only: customizing one saves a visible override for the entire service or one workspace, validated and previewed against the live agent context first.`;

const COMMAND_KIND_LABELS: Record<string, string> = {
  builtin: t`Built-in`,
  command: t`Command file`,
  mcp_prompt: t`MCP prompt`,
  skill: t`Skill`,
};

/** A service that does not serve these routes at all, as opposed to one that failed. */
const unsupported = (error: unknown) =>
  error instanceof TransportError && [404, 405, 501].includes(error.status ?? 0);

/** The command's state in words; the reason is its hover text. */
function commandState(command: CommandDefinition): {
  tone: StatusTone;
  label: string;
  detail?: string;
} {
  const detail = command.disabled_detail || command.disabled_reason || undefined;
  if (command.disabled_reason === 'command_shadowed')
    return {
      tone: 'idle',
      label: t`Shadowed`,
      detail: detail ?? t`Another command file of the same name wins.`,
    };
  if (command.disabled_reason === 'command_name_reserved')
    return {
      tone: 'idle',
      label: t`Reserved name`,
      detail: detail ?? t`A built-in command already has this name.`,
    };
  if (!command.enabled)
    return {
      tone: 'stopped',
      label: t`Unavailable`,
      detail: detail ?? t`This command cannot run.`,
    };
  if (command.ambiguous)
    return {
      tone: 'warning',
      label: t`Same name elsewhere`,
      detail: t`Another source also has ${ph({ name: command.name })}; this one runs as ${ph({ qualified_id: command.qualified_id })}.`,
    };
  if (command.unsupported_fields.length)
    return {
      tone: 'warning',
      label: t`Some fields ignored`,
      detail: t`This file’s ${ph({ fields: command.unsupported_fields.join(', ') })} settings are not used.`,
    };
  return { tone: 'success', label: t`Available` };
}

/** A whole row that opens its details; it has no controls of its own. */
function OpenRow({
  onOpen,
  ...props
}: Omit<ItemRowProps, 'onClick' | 'onKeyDown' | 'role' | 'tabIndex'> & {
  onOpen: () => void;
}) {
  return (
    <ItemRow
      actions={null}
      slot={null}
      {...props}
      className="cursor-default"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen();
      }}
      role="button"
      tabIndex={0}
    />
  );
}

function CommandDetail({ command, onClose }: { command: CommandDefinition; onClose: () => void }) {
  const state = commandState(command);
  const items: KeyValueItem[] = [
    { label: t`Kind`, value: COMMAND_KIND_LABELS[command.kind] ?? command.kind },
    ...(commandSource(command) ? [{ label: t`Source`, value: commandSource(command) }] : []),
    {
      label: t`Status`,
      value: (
        <span className="inline-flex justify-end" title={state.detail}>
          <StatusIndicator label={state.label} tone={state.tone} />
        </span>
      ),
      title: state.detail ?? state.label,
    },
    { label: t`Name`, value: command.id, mono: true },
    ...(command.argument_hint
      ? [{ label: t`Usage`, value: `${command.id} ${command.argument_hint}`, mono: true }]
      : []),
    ...(command.aliases.length
      ? [{ label: t`Also available as`, value: command.aliases.join(', '), mono: true }]
      : []),
  ];
  return (
    <DetailPane icon={<SquareSlashIcon />} onClose={onClose} title={command.title}>
      <p className="mb-3 text-ui text-muted-foreground">
        {command.description || t`The service did not provide a description.`}
      </p>
      {!command.enabled && (command.disabled_detail || command.disabled_reason) ? (
        <p className="mb-3 text-xs text-destructive" role="alert">
          {command.disabled_detail || command.disabled_reason}
        </p>
      ) : null}
      <KeyValueGrid items={items} />
    </DetailPane>
  );
}

type ListNoun = 'prompt families' | 'reminders' | 'commands';

/** A list's loading, not-offered and failure lines, each written whole. */
function listStateCopy(noun: ListNoun): { loading: string; unoffered: string; failed: string } {
  switch (noun) {
    case 'prompt families':
      return {
        loading: t`Loading prompt families…`,
        unoffered: t`This service doesn’t offer prompt families.`,
        failed: t`Prompt families couldn’t be loaded.`,
      };
    case 'reminders':
      return {
        loading: t`Loading reminders…`,
        unoffered: t`This service doesn’t offer reminders.`,
        failed: t`Reminders couldn’t be loaded.`,
      };
    case 'commands':
      return {
        loading: t`Loading commands…`,
        unoffered: t`This service doesn’t offer commands.`,
        failed: t`Commands couldn’t be loaded.`,
      };
  }
}

/** One list's stand-in while it loads, fails, is not offered or is empty. */
function ListState({
  query,
  noun,
  empty,
}: {
  query: { isPending: boolean; error: Error | null; refetch: () => unknown };
  noun: ListNoun;
  empty: string;
}): ReactNode {
  const copy = listStateCopy(noun);
  if (query.isPending) return <StateView kind="loading" size="row" title={copy.loading} />;
  if (query.error)
    return unsupported(query.error) ? (
      <StateView kind="unavailable" size="row" title={copy.unoffered} />
    ) : (
      <StateView
        action={{ label: t`Retry`, onClick: () => void query.refetch() }}
        kind="error"
        size="row"
        title={copy.failed}
      />
    );
  return <StateView kind="empty" size="row" title={empty} />;
}

export function PromptsCommandsSettings({ initialWorkspaceId }: { initialWorkspaceId?: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [toolbar, toolbarWidth] = useElementWidth<HTMLDivElement>();
  const narrow = narrowerThan(toolbarWidth, 600);
  // Below 400 px the workspace choice takes its own line rather than clip its name.
  const tight = narrowerThan(toolbarWidth, 400);
  const [view, setView] = useState<View>('prompts');
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId ?? '');
  const [editor, setEditor] = useState<{ prompt?: PromptDefinition; key: number }>();
  const [selectedCommand, setSelectedCommand] = useState<CommandDefinition>();
  const context = workspaceId ? { workspaceId } : {};
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint, 'prompt-settings'),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const prompts = useQuery({
    queryKey: queryKeys.key('prompts', settings.endpoint, workspaceId),
    queryFn: ({ signal }) => repository.prompts(signal, context),
    retry: false,
  });
  const commands = useQuery({
    queryKey: queryKeys.key('commands', settings.endpoint, workspaceId),
    queryFn: ({ signal }) => repository.commands(signal, context),
    retry: false,
  });
  const reload = useMutation({
    mutationFn: () => repository.reloadPrompts(context),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.key('prompts', settings.endpoint),
      });
      toast.success(t`Prompt sources reloaded`, {
        description: plural(result.prompt_count, {
          one: '# prompt family available.',
          other: '# prompt families available.',
        }),
      });
    },
    onError: () => toast.error(t`Prompt sources weren’t reloaded. Try again.`),
  });
  const openEditor = (prompt?: PromptDefinition) =>
    setEditor((current) => ({ prompt, key: (current?.key ?? 0) + 1 }));
  const families = prompts.data?.filter((prompt) => !reminderMeta(prompt)) ?? [];
  // A service without prompt families has nothing to reload or add to.
  const promptsOffered = !unsupported(prompts.error);
  const selectedWorkspace = workspaces.data?.find((row) => row.id === workspaceId);
  const selectedWorkspaceName = selectedWorkspace ? workspaceName(selectedWorkspace) : undefined;

  const promptRow = (prompt: PromptDefinition) => {
    const profiles = Object.keys(prompt.profiles).length;
    const problems = prompt.validation_errors.length;
    return (
      <OpenRow
        icon={<FileTextIcon />}
        key={prompt.id}
        meta={
          <MetaLine
            parts={[
              scopeLabel(prompt.scope),
              plural(profiles, { one: '# profile', other: '# profiles' }),
              // The template text that fails stays in the editor; the list names the count.
              problems
                ? plural(problems, { one: '# problem to fix', other: '# problems to fix' })
                : '',
            ]}
          />
        }
        onOpen={() => openEditor(prompt)}
        status={
          <StatusIndicator
            label={prompt.enabled && !problems ? t`Ready` : t`Needs attention`}
            tone={prompt.enabled && !problems ? 'success' : 'warning'}
          />
        }
        title={prompt.title || prompt.id}
      />
    );
  };

  const commandRow = (command: CommandDefinition) => {
    const state = commandState(command);
    return (
      <OpenRow
        aria-current={selectedCommand === command || undefined}
        icon={<ScrollTextIcon />}
        key={`${command.kind}:${command.qualified_id}:${command.source}`}
        meta={
          <MetaLine
            parts={[
              {
                text: command.argument_hint ? `${command.id} ${command.argument_hint}` : command.id,
                mono: true,
              },
              commandSource(command),
              command.description ?? '',
            ]}
          />
        }
        onOpen={() => setSelectedCommand(command)}
        selected={selectedCommand === command}
        status={
          <span className="flex min-w-0" title={state.detail}>
            <StatusIndicator label={state.label} tone={state.tone} />
          </span>
        }
        title={command.title}
      />
    );
  };

  const list =
    view === 'prompts' ? (
      <div className="min-w-0">
        <SettingsGroupLabel className="mt-0">{t`Prompt families`}</SettingsGroupLabel>
        <ItemList label={t`Prompt families`}>
          {families.length ? (
            families.map(promptRow)
          ) : (
            <ListState
              empty={t`No prompt families in this view.`}
              noun="prompt families"
              query={prompts}
            />
          )}
        </ItemList>
      </div>
    ) : view === 'reminders' ? (
      <div className="min-w-0">
        <SettingsGroupLabel className="mt-0">{t`Reminders`}</SettingsGroupLabel>
        {prompts.data ? (
          <RemindersList
            onChanged={() => void prompts.refetch()}
            onEdit={(prompt) => openEditor(prompt)}
            prompts={prompts.data}
          />
        ) : (
          <ItemList label={t`Reminders`}>
            <ListState empty="" noun="reminders" query={prompts} />
          </ItemList>
        )}
      </div>
    ) : commands.data?.length ? (
      <div className="min-w-0">
        {commandGroups(commands.data).map((group, index) => (
          <div key={group.heading}>
            <SettingsGroupLabel className={index ? undefined : 'mt-0'}>
              {group.heading}
            </SettingsGroupLabel>
            <ItemList label={group.heading}>{group.rows.map(commandRow)}</ItemList>
          </div>
        ))}
      </div>
    ) : (
      <div className="min-w-0">
        <SettingsGroupLabel className="mt-0">{t`Commands`}</SettingsGroupLabel>
        <ItemList label={t`Commands`}>
          <ListState empty={t`No commands in this view.`} noun="commands" query={commands} />
        </ItemList>
      </div>
    );

  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)]"
      onKeyDown={newItemKey(promptsOffered && view !== 'commands' ? () => openEditor() : undefined)}
    >
      <SettingsSectionHeading info={INFO} title={t`Prompts & commands`} />
      <div
        className="mb-1.5 flex min-h-[2.125rem] min-w-0 flex-wrap items-center gap-2.5 gap-y-1.5 whitespace-nowrap"
        data-slot="settings-toolbar"
        ref={toolbar}
      >
        <SegmentedControl
          iconOnly={narrow ? 'others' : false}
          label={t`View`}
          onValueChange={(next) => {
            setView(next);
            setSelectedCommand(undefined);
          }}
          options={[
            { value: 'prompts', label: t`Prompts`, icon: <FileTextIcon aria-hidden="true" /> },
            { value: 'reminders', label: t`Reminders`, icon: <BellIcon aria-hidden="true" /> },
            {
              value: 'commands',
              label: t`Commands`,
              icon: <SquareSlashIcon aria-hidden="true" />,
            },
          ]}
          value={view}
        />
        <Select
          onValueChange={(value) => setWorkspaceId(value === 'all' ? '' : value)}
          value={workspaceId || 'all'}
        >
          <SelectTrigger
            aria-label={t`Prompt workspace`}
            className={cn(
              'min-w-0 justify-start gap-2 px-2.5 text-menu *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:text-left',
              // At least 11rem and its value ("No workspace" in every language): when
              // the line has no room, the field moves to the next line instead of cutting it.
              // On that line of its own the value wraps, so a narrow phone still reads it whole.
              tight
                ? 'order-last h-auto! min-h-[30px] w-full py-1 *:data-[slot=select-value]:overflow-visible! *:data-[slot=select-value]:leading-snug *:data-[slot=select-value]:break-words *:data-[slot=select-value]:whitespace-normal! *:data-[slot=select-value]:[-webkit-line-clamp:unset]! *:data-[slot=select-value]:[line-break:strict] *:data-[slot=select-value]:[word-break:auto-phrase]'
                : 'h-[30px]! w-auto max-w-[min(100%,18rem)] min-w-[min(11rem,100%)] shrink-0 *:data-[slot=select-value]:truncate',
            )}
            size="sm"
            title={selectedWorkspaceName ?? t`No workspace`}
          >
            <FolderIcon
              aria-hidden="true"
              // Below 20rem the value needs the icon's room to keep "workspace" whole.
              className={cn('size-3.5 text-muted-foreground', tight && 'max-[20rem]:hidden')}
            />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t`No workspace`}</SelectItem>
            {workspaces.data?.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspaceName(workspace)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex-1" />
        {promptsOffered ? (
          // One group, so the actions wrap together rather than leaving "+" alone.
          <span className="flex shrink-0 items-center gap-2.5">
            <IconButton
              disabled={reload.isPending}
              icon={reload.isPending ? <Spinner /> : <RefreshIcon />}
              label={t`Reload sources`}
              onClick={() => reload.mutate()}
            />
            {narrow ? (
              <IconButton icon={<AddIcon />} label={t`New prompt`} onClick={() => openEditor()} />
            ) : (
              <Button className="shrink-0" onClick={() => openEditor()} variant="outline">
                <AddIcon aria-hidden="true" /> {t`New prompt`}
              </Button>
            )}
          </span>
        ) : null}
      </div>
      <ListDetailLayout
        className="min-h-[20rem]"
        detail={
          view === 'commands' && selectedCommand ? (
            <CommandDetail
              command={selectedCommand}
              key={`${selectedCommand.kind}:${selectedCommand.qualified_id}`}
              onClose={() => setSelectedCommand(undefined)}
            />
          ) : undefined
        }
        list={list}
      />

      {editor ? (
        <PromptEditorDialog
          key={editor.key}
          onClose={() => setEditor(undefined)}
          prompt={editor.prompt}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  );
}
