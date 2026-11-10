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

type View = 'prompts' | 'reminders' | 'commands';

const INFO =
  'Inspect the instructions, reminders and commands the service supplies. Built-ins are read-only: customizing one saves a visible override for the entire service or one workspace, validated and previewed against the live agent context first.';

const COMMAND_KIND_LABELS: Record<string, string> = {
  builtin: 'Built-in',
  command: 'Command file',
  mcp_prompt: 'MCP prompt',
  skill: 'Skill',
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
      label: 'Shadowed',
      detail: detail ?? 'Another command file of the same name wins.',
    };
  if (command.disabled_reason === 'command_name_reserved')
    return {
      tone: 'idle',
      label: 'Reserved name',
      detail: detail ?? 'A built-in command already has this name.',
    };
  if (!command.enabled)
    return { tone: 'stopped', label: 'Unavailable', detail: detail ?? 'This command cannot run.' };
  if (command.ambiguous)
    return {
      tone: 'warning',
      label: 'Same name elsewhere',
      detail: `Another source also has ${command.name}; this one runs as ${command.qualified_id}.`,
    };
  if (command.unsupported_fields.length)
    return {
      tone: 'warning',
      label: 'Some fields ignored',
      detail: `This file’s ${command.unsupported_fields.join(', ')} settings are not used.`,
    };
  return { tone: 'success', label: 'Available' };
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
    { label: 'Kind', value: COMMAND_KIND_LABELS[command.kind] ?? command.kind },
    ...(commandSource(command) ? [{ label: 'Source', value: commandSource(command) }] : []),
    {
      label: 'Status',
      value: (
        <span className="inline-flex justify-end" title={state.detail}>
          <StatusIndicator label={state.label} tone={state.tone} />
        </span>
      ),
      title: state.detail ?? state.label,
    },
    { label: 'Name', value: command.id, mono: true },
    ...(command.argument_hint
      ? [{ label: 'Usage', value: `${command.id} ${command.argument_hint}`, mono: true }]
      : []),
    ...(command.aliases.length
      ? [{ label: 'Also available as', value: command.aliases.join(', '), mono: true }]
      : []),
  ];
  return (
    <DetailPane icon={<SquareSlashIcon />} onClose={onClose} title={command.title}>
      <p className="mb-3 text-[0.8125rem] text-muted-foreground">
        {command.description || 'The service did not provide a description.'}
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

/** One list's stand-in while it loads, fails, is not offered or is empty. */
function ListState({
  query,
  noun,
  empty,
}: {
  query: { isPending: boolean; error: Error | null; refetch: () => unknown };
  noun: string;
  empty: string;
}): ReactNode {
  if (query.isPending) return <StateView kind="loading" size="row" title={`Loading ${noun}…`} />;
  if (query.error)
    return unsupported(query.error) ? (
      <StateView kind="unavailable" size="row" title={`This service doesn’t offer ${noun}.`} />
    ) : (
      <StateView
        action={{ label: 'Retry', onClick: () => void query.refetch() }}
        kind="error"
        size="row"
        title={`${noun[0]?.toUpperCase()}${noun.slice(1)} couldn’t be loaded.`}
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
      toast.success('Prompt sources reloaded', {
        description: `${result.prompt_count} prompt ${result.prompt_count === 1 ? 'family' : 'families'} available.`,
      });
    },
    onError: () => toast.error('Prompt sources weren’t reloaded. Try again.'),
  });
  const openEditor = (prompt?: PromptDefinition) =>
    setEditor((current) => ({ prompt, key: (current?.key ?? 0) + 1 }));
  const families = prompts.data?.filter((prompt) => !reminderMeta(prompt)) ?? [];
  const workspaceName = workspaces.data?.find((row) => row.id === workspaceId)?.display_name;

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
              `${profiles} ${profiles === 1 ? 'profile' : 'profiles'}`,
              // The template text that fails stays in the editor; the list names the count.
              problems ? `${problems} ${problems === 1 ? 'problem' : 'problems'} to fix` : '',
            ]}
          />
        }
        onOpen={() => openEditor(prompt)}
        status={
          <StatusIndicator
            label={prompt.enabled && !problems ? 'Ready' : 'Needs attention'}
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
        <SettingsGroupLabel className="mt-0">Prompt families</SettingsGroupLabel>
        <ItemList label="Prompt families">
          {families.length ? (
            families.map(promptRow)
          ) : (
            <ListState
              empty="No prompt families in this view"
              noun="prompt families"
              query={prompts}
            />
          )}
        </ItemList>
      </div>
    ) : view === 'reminders' ? (
      <div className="min-w-0">
        <SettingsGroupLabel className="mt-0">Reminders</SettingsGroupLabel>
        {prompts.data ? (
          <RemindersList
            onChanged={() => void prompts.refetch()}
            onEdit={(prompt) => openEditor(prompt)}
            prompts={prompts.data}
          />
        ) : (
          <ItemList label="Reminders">
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
        <SettingsGroupLabel className="mt-0">Commands</SettingsGroupLabel>
        <ItemList label="Commands">
          <ListState empty="No commands in this view" noun="commands" query={commands} />
        </ItemList>
      </div>
    );

  return (
    <div className="grid min-w-0">
      <SettingsSectionHeading info={INFO} title="Prompts & commands" />
      <div
        className={cn(
          'mb-1.5 flex min-w-0 items-center gap-2.5 whitespace-nowrap',
          tight ? 'flex-wrap gap-y-1.5' : 'h-[2.125rem]',
        )}
        data-slot="settings-toolbar"
        ref={toolbar}
      >
        <SegmentedControl
          iconOnly={narrow ? 'others' : false}
          label="View"
          onValueChange={(next) => {
            setView(next);
            setSelectedCommand(undefined);
          }}
          options={[
            { value: 'prompts', label: 'Prompts', icon: <FileTextIcon aria-hidden="true" /> },
            { value: 'reminders', label: 'Reminders', icon: <BellIcon aria-hidden="true" /> },
            {
              value: 'commands',
              label: 'Commands',
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
            aria-label="Prompt workspace"
            className={cn(
              'h-7! min-w-0 shrink gap-1.5 px-2 text-xs *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate',
              tight ? 'order-last w-full *:data-[slot=select-value]:flex-1' : 'w-44',
            )}
            size="sm"
            title={workspaceName ?? 'Global service view'}
          >
            <FolderIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Global service view</SelectItem>
            {workspaces.data?.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex-1" />
        <IconButton
          disabled={reload.isPending}
          icon={reload.isPending ? <Spinner /> : <RefreshIcon />}
          label="Reload sources"
          onClick={() => reload.mutate()}
        />
        {narrow ? (
          <IconButton icon={<AddIcon />} label="New prompt" onClick={() => openEditor()} />
        ) : (
          <Button className="shrink-0" onClick={() => openEditor()} variant="outline">
            <AddIcon aria-hidden="true" /> New prompt
          </Button>
        )}
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
