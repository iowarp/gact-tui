import { queryKeys } from '@/lib/query-keys';
import type { PromptDefinition } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileTextIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { reminderMeta } from '@/lib/reminder-meta';
import { useConnectionSettings } from '@/providers/connection-provider';
import { DetailPane, ListDetailLayout } from './primitives/detail-pane';
import { DialogFrame } from './primitives/dialog-frame';
import { SettingsLoadError } from './settings-health-load-error';
import { plainReason } from './settings-health-reason';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { SegmentedControl } from './primitives/segmented-control';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';
import { CommandDetail, CommandList } from './settings-prompts-commands';
import {
  PromptDefinitionForm,
  PromptEditorActions,
  PromptPreview,
} from './settings-prompts-editor';
import { commandKey, promptScopeLabel, usePromptEditor } from './settings-prompts-model';
import { RemindersList } from './settings-reminders';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { Button } from '@/components/ui/button';

type View = 'prompts' | 'reminders' | 'commands';
const VIEWS = [
  { value: 'prompts', label: 'Prompts' },
  { value: 'reminders', label: 'Reminders' },
  { value: 'commands', label: 'Commands' },
] as const;

type EditorView = 'definition' | 'preview';
const EDITOR_VIEWS = [
  { value: 'definition', label: 'Definition' },
  { value: 'preview', label: 'Rendered preview' },
] as const;

/** One prompt family opened beside the list: its definition, a live render and its save actions. */
function PromptDetail({
  prompt,
  workspaceId,
  onClose,
}: {
  prompt: PromptDefinition;
  workspaceId: string;
  onClose: () => void;
}) {
  const editor = usePromptEditor({ prompt, workspaceId, onSaved: () => undefined });
  const [view, setView] = useState<EditorView>('definition');
  return (
    <DetailPane
      icon={<FileTextIcon />}
      onClose={onClose}
      tabs={
        <SegmentedControl
          label="Prompt view"
          onValueChange={setView}
          options={EDITOR_VIEWS}
          value={view}
        />
      }
      title={prompt.title || prompt.id}
    >
      <p className="pb-3 text-xs text-muted-foreground">
        {prompt.scope === 'builtin'
          ? 'The packaged definition stays untouched; saving creates an explicit override.'
          : 'Changes are validated by the connected service before they are saved.'}
      </p>
      {view === 'definition' ? (
        <PromptDefinitionForm editor={editor} />
      ) : (
        <PromptPreview editor={editor} />
      )}
      <PromptEditorActions editor={editor} />
    </DetailPane>
  );
}

function PromptCreateDialog({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const editor = usePromptEditor({ workspaceId, onSaved: onClose });
  return (
    <DialogFrame
      confirm={{
        label: 'Create prompt',
        onConfirm: () => editor.save.mutate(),
        disabled: !editor.canSave,
      }}
      description="Changes are validated by the connected service before they are saved."
      icon={<FileTextIcon className="size-4" />}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      secondary={
        <Button
          className="mr-auto"
          disabled={!editor.canValidate}
          onClick={() => editor.validate.mutate()}
          variant="ghost"
        >
          Validate
        </Button>
      }
      title="New prompt"
    >
      <div className="clio-scrollbar -mx-[18px] max-h-[60vh] overflow-y-auto px-[18px] pb-1">
        <PromptDefinitionForm editor={editor} />
      </div>
    </DialogFrame>
  );
}

function promptMeta(prompt: PromptDefinition) {
  const count = Object.keys(prompt.profiles).length;
  return `${count} ${count === 1 ? 'profile' : 'profiles'}, default ${prompt.default_profile || 'unavailable'}`;
}

export function PromptsCommandsSettings({ initialWorkspaceId }: { initialWorkspaceId?: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId ?? '');
  const [view, setView] = useState<View>('prompts');
  const [openPromptId, setOpenPromptId] = useState<string>();
  const [openCommandKey, setOpenCommandKey] = useState<string>();
  const [creating, setCreating] = useState(false);
  const context = workspaceId ? { workspaceId } : {};
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint, 'prompt-settings'),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const prompts = useQuery({
    queryKey: queryKeys.key('prompts', settings.endpoint, workspaceId),
    queryFn: ({ signal }) => repository.prompts(signal, context),
  });
  const commands = useQuery({
    queryKey: queryKeys.key('commands', settings.endpoint, workspaceId),
    queryFn: ({ signal }) => repository.commands(signal, context),
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
    onError: (error) =>
      toast.error('Could not reload prompts', { description: plainReason(error) }),
  });
  const openPrompt = prompts.data?.find((prompt) => prompt.id === openPromptId);
  const openCommand = commands.data?.find((command) => commandKey(command) === openCommandKey);
  const families = prompts.data?.filter((prompt) => !reminderMeta(prompt)) ?? [];
  const closeDetails = () => {
    setOpenPromptId(undefined);
    setOpenCommandKey(undefined);
  };
  const togglePrompt = (id: string) =>
    setOpenPromptId((current) => (current === id ? undefined : id));

  const promptsState = prompts.error ? (
    <SettingsLoadError
      error={prompts.error}
      onRetry={() => void prompts.refetch()}
      retrying={prompts.isFetching}
      title="Prompts unavailable."
    />
  ) : prompts.isPending ? (
    <StateView kind="loading" size="row" title="Loading prompts…" />
  ) : null;

  const list =
    view === 'prompts' ? (
      <>
        <SettingsGroupLabel
          addLabel="New prompt"
          info="Built-ins are read-only. Customizing one saves a visible scoped override."
          onAdd={() => setCreating(true)}
        >
          Prompt families
        </SettingsGroupLabel>
        {promptsState}
        {prompts.error ? null : families.length ? (
          <ItemList label="Prompt families">
            {families.map((prompt) => (
              <ItemRow
                aria-expanded={openPromptId === prompt.id}
                className="cursor-pointer"
                icon={<FileTextIcon />}
                key={prompt.id}
                meta={
                  <>
                    <span className="mr-2.5">{promptScopeLabel(prompt.scope)}</span>
                    <span>{promptMeta(prompt)}</span>
                  </>
                }
                onClick={() => togglePrompt(prompt.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  togglePrompt(prompt.id);
                }}
                role="button"
                selected={openPromptId === prompt.id}
                status={
                  <StatusIndicator
                    label={prompt.enabled ? 'Ready' : 'Needs attention'}
                    tone={prompt.enabled ? 'success' : 'warning'}
                  />
                }
                statusWidth={136}
                tabIndex={0}
                title={prompt.title || prompt.id}
              />
            ))}
          </ItemList>
        ) : prompts.data ? (
          <StateView
            kind="empty"
            size="row"
            title="No prompt families were reported for this view."
          />
        ) : null}
      </>
    ) : view === 'reminders' ? (
      <>
        <SettingsGroupLabel info="Notes the agent receives during its work. Switch one off, or open it to edit its text; a change saves a visible override.">
          Reminders
        </SettingsGroupLabel>
        {promptsState}
        {prompts.data ? (
          <RemindersList
            onChanged={() => void prompts.refetch()}
            onEdit={(prompt) => togglePrompt(prompt.id)}
            openId={openPromptId}
            prompts={prompts.data}
          />
        ) : null}
      </>
    ) : (
      <>
        {commands.error ? (
          <>
            <SettingsGroupLabel>Commands</SettingsGroupLabel>
            <SettingsLoadError
              error={commands.error}
              onRetry={() => void commands.refetch()}
              retrying={commands.isFetching}
              title="Commands unavailable."
            />
          </>
        ) : commands.isPending ? (
          <StateView kind="loading" size="row" title="Loading commands…" />
        ) : commands.data?.length ? (
          <CommandList
            commands={commands.data}
            onOpen={(key) => setOpenCommandKey((current) => (current === key ? undefined : key))}
            openKey={openCommandKey}
          />
        ) : (
          <>
            <SettingsGroupLabel>Commands</SettingsGroupLabel>
            <StateView kind="empty" size="row" title="No commands were reported for this view." />
          </>
        )}
      </>
    );

  const detail =
    view === 'commands' ? (
      openCommand ? (
        <CommandDetail
          command={openCommand}
          key={openCommandKey}
          onClose={() => setOpenCommandKey(undefined)}
        />
      ) : undefined
    ) : openPrompt ? (
      <PromptDetail
        key={`${openPrompt.id}:${workspaceId}`}
        onClose={() => setOpenPromptId(undefined)}
        prompt={openPrompt}
        workspaceId={workspaceId}
      />
    ) : undefined;

  return (
    <div className="grid gap-1">
      <SettingsSectionHeading
        actions={
          <>
            <SegmentedControl
              label="Show"
              onValueChange={(next) => {
                closeDetails();
                setView(next);
              }}
              options={VIEWS}
              value={view}
            />
            <IconButton
              disabled={reload.isPending}
              icon={<RefreshIcon />}
              label="Reload sources"
              onClick={() => reload.mutate()}
            />
          </>
        }
        info="Inspect the instructions and commands supplied by the service. Validate and preview prompt overrides against the live agent context before saving them. Commands come from the service, installed plugins, and skills."
        title="Prompts & commands"
      />
      <SettingsRow title="Workspace">
        <Select
          onValueChange={(value) => {
            closeDetails();
            setWorkspaceId(value === 'all' ? '' : value);
          }}
          value={workspaceId || 'all'}
        >
          <SelectTrigger
            aria-label="Prompt workspace"
            className="h-[1.875rem] w-full min-w-0 text-[0.78125rem]"
            size="sm"
          >
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
      </SettingsRow>
      <ListDetailLayout detail={detail} list={list} />
      {creating ? (
        <PromptCreateDialog onClose={() => setCreating(false)} workspaceId={workspaceId} />
      ) : null}
    </div>
  );
}
