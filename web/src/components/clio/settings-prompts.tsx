import type { CommandDefinition, PromptDefinition } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  EyeIcon,
  FileTextIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  ScrollTextIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioInteractiveRow } from './interactive-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioStatus } from './status';

interface PromptDraft {
  id: string;
  title: string;
  description: string;
  profile: string;
  scope: 'global' | 'workspace';
  text: string;
  provider: string;
  model: string;
}

const emptyDraft: PromptDraft = {
  id: '',
  title: '',
  description: '',
  profile: 'default',
  scope: 'global',
  text: '',
  provider: '',
  model: '',
};

function draftForPrompt(prompt: PromptDefinition): PromptDraft {
  const profileName = prompt.default_profile || Object.keys(prompt.profiles)[0] || 'default';
  const profile = prompt.profiles[profileName];
  return {
    id: prompt.id,
    title: prompt.title,
    description: prompt.description ?? '',
    profile: profileName,
    scope: prompt.scope === 'workspace' ? 'workspace' : 'global',
    text: profile?.text ?? '',
    provider: profile?.provider ?? '',
    model: profile?.model ?? '',
  };
}

function PromptStatus({ prompt }: { prompt: PromptDefinition }) {
  return (
    <ClioStatus
      label={prompt.enabled ? 'Ready' : 'Needs attention'}
      value={prompt.enabled ? 'healthy' : 'degraded'}
    />
  );
}

function CommandDetail({ command }: { command?: CommandDefinition }) {
  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{command?.title}</DialogTitle>
        <DialogDescription>
          {command?.description || 'The service did not provide a description.'}
        </DialogDescription>
      </DialogHeader>
      {command ? (
        <div className="grid gap-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <ClioStatus
              label={command.enabled ? 'Available' : 'Unavailable'}
              value={command.enabled ? 'healthy' : 'unavailable'}
            />
            <Badge variant="outline">{command.source}</Badge>
            {command.user_invocable !== false ? <Badge variant="outline">For you</Badge> : null}
            {command.agent_invocable ? <Badge variant="outline">For agents</Badge> : null}
          </div>
          {command.disabled_reason ? (
            <Alert variant="destructive">
              <AlertTitle>Unavailable</AlertTitle>
              <AlertDescription>{command.disabled_reason}</AlertDescription>
            </Alert>
          ) : null}
          {command.argument_hint ? (
            <div>
              <p className="font-medium">Usage</p>
              <p className="mt-1 rounded-lg border bg-muted/30 p-3 font-mono text-xs">
                {command.id} {command.argument_hint}
              </p>
            </div>
          ) : null}
          {command.aliases.length ? (
            <p className="text-muted-foreground">Also available as {command.aliases.join(', ')}</p>
          ) : null}
          <p className="font-mono text-xs text-muted-foreground">{command.id}</p>
        </div>
      ) : null}
    </DialogContent>
  );
}

export function PromptsCommandsSettings({ initialWorkspaceId }: { initialWorkspaceId?: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId ?? '');
  const [editing, setEditing] = useState<PromptDefinition>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<PromptDraft>(emptyDraft);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [renderedText, setRenderedText] = useState('');
  const [selectedCommand, setSelectedCommand] = useState<CommandDefinition>();
  const context = workspaceId ? { workspaceId } : {};
  const workspaces = useQuery({
    queryKey: ['workspaces', settings.endpoint, 'prompt-settings'],
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const prompts = useQuery({
    queryKey: ['prompts', settings.endpoint, workspaceId],
    queryFn: ({ signal }) => repository.prompts(signal, context),
  });
  const commands = useQuery({
    queryKey: ['commands', settings.endpoint, workspaceId],
    queryFn: ({ signal }) => repository.commands(signal, context),
  });
  const resolved = useQuery({
    queryKey: ['prompt', settings.endpoint, editing?.id, draft.profile, workspaceId],
    queryFn: ({ signal }) =>
      repository.prompt(editing?.id ?? '', { ...context, profile: draft.profile }, signal),
    enabled: editorOpen && Boolean(editing?.id),
  });
  const reload = useMutation({
    mutationFn: () => repository.reloadPrompts(context),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['prompts', settings.endpoint] });
      toast.success('Prompt sources reloaded', {
        description: `${result.prompt_count} prompt ${result.prompt_count === 1 ? 'family' : 'families'} available.`,
      });
    },
    onError: (error) => toast.error('Could not reload prompts', { description: error.message }),
  });
  const preview = useMutation({
    mutationFn: () => repository.renderPrompt(draft.id, { ...context, profile: draft.profile }),
    onSuccess: (result) => setRenderedText(result.text),
    onError: (error) => toast.error('Could not render prompt', { description: error.message }),
  });
  const validate = useMutation({
    mutationFn: () =>
      repository.validatePrompt(draft.id, {
        ...context,
        profile: draft.profile,
        text: draft.text,
      }),
    onSuccess: (result) => {
      setValidationErrors(result.validation_errors);
      if (result.enabled) toast.success('Prompt is valid');
    },
    onError: (error) => toast.error('Could not validate prompt', { description: error.message }),
  });
  const save = useMutation({
    mutationFn: async () => {
      const result = await repository.validatePrompt(draft.id, {
        ...context,
        profile: draft.profile,
        text: draft.text,
      });
      setValidationErrors(result.validation_errors);
      if (!result.enabled) throw new Error('Fix the validation errors before saving.');
      return repository.savePrompt(draft.id, {
        scope: draft.scope,
        workspaceId: draft.scope === 'workspace' ? workspaceId : undefined,
        profile: draft.profile,
        text: draft.text,
        title: draft.title,
        description: draft.description,
        provider: draft.provider || undefined,
        model: draft.model || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['prompts', settings.endpoint] });
      setEditorOpen(false);
      toast.success(editing ? 'Prompt override saved' : 'Prompt created');
    },
    onError: (error) => toast.error('Prompt was not saved', { description: error.message }),
  });

  const openEditor = (prompt?: PromptDefinition) => {
    setEditing(prompt);
    setDraft(prompt ? draftForPrompt(prompt) : emptyDraft);
    setValidationErrors([]);
    setRenderedText('');
    setEditorOpen(true);
  };
  const chooseProfile = (profileName: string) => {
    const profile = editing?.profiles[profileName];
    setDraft((current) => ({
      ...current,
      profile: profileName,
      text: profile?.text ?? current.text,
      provider: profile?.provider ?? '',
      model: profile?.model ?? '',
    }));
    setValidationErrors([]);
    setRenderedText('');
  };
  const set = (field: keyof PromptDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const workspaceRequired = draft.scope === 'workspace' && !workspaceId;

  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        description="Inspect the instructions and commands supplied by the service. Validate and preview prompt overrides against the live agent context before saving them."
        title="Prompts and commands"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          onValueChange={(value) => setWorkspaceId(value === 'all' ? '' : value)}
          value={workspaceId || 'all'}
        >
          <SelectTrigger aria-label="Prompt workspace" className="min-w-56">
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
        <div className="flex gap-2">
          <Button onClick={() => reload.mutate()} variant="outline">
            <RefreshCwIcon className={reload.isPending ? 'animate-spin' : undefined} /> Reload
            sources
          </Button>
          <Button onClick={() => openEditor()}>
            <PlusIcon /> New prompt
          </Button>
        </div>
      </div>
      <Tabs defaultValue="prompts">
        <TabsList>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="commands">Commands</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4" value="prompts">
          <Frame spacing="sm">
            <FrameHeader>
              <FrameTitle>Prompt families</FrameTitle>
              <FrameDescription>
                Built-ins are read-only. Customizing one saves a visible scoped override.
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="grid gap-1 p-2">
              {prompts.data?.map((prompt) => (
                <ClioInteractiveRow
                  key={prompt.id}
                  onClick={() => openEditor(prompt)}
                  role="button"
                >
                  <div className="flex items-start gap-3">
                    <FileTextIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{prompt.title || prompt.id}</p>
                        <PromptStatus prompt={prompt} />
                        <Badge variant="outline">{prompt.scope}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {Object.keys(prompt.profiles).length}{' '}
                        {Object.keys(prompt.profiles).length === 1 ? 'profile' : 'profiles'},
                        default {prompt.default_profile || 'Unavailable'}
                      </p>
                    </div>
                  </div>
                </ClioInteractiveRow>
              ))}
              {!prompts.isPending && !prompts.data?.length ? (
                <p className="p-5 text-sm text-muted-foreground">
                  No prompt families were reported for this view.
                </p>
              ) : null}
              {prompts.error ? (
                <Alert variant="destructive">
                  <AlertTitle>Prompts unavailable</AlertTitle>
                  <AlertDescription>{prompts.error.message}</AlertDescription>
                </Alert>
              ) : null}
            </FramePanel>
          </Frame>
        </TabsContent>
        <TabsContent className="mt-4" value="commands">
          <Frame spacing="sm">
            <FrameHeader>
              <FrameTitle>Commands</FrameTitle>
              <FrameDescription>
                Commands are supplied by the service, installed agents, blueprints, and skills.
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="grid gap-1 p-2">
              {commands.data?.map((command) => (
                <ClioInteractiveRow
                  disabled={!command.enabled}
                  key={command.id}
                  onClick={() => setSelectedCommand(command)}
                  role="button"
                >
                  <div className="flex items-start gap-3">
                    <ScrollTextIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{command.title}</p>
                        <ClioStatus
                          label={command.enabled ? 'Available' : 'Unavailable'}
                          value={command.enabled ? 'healthy' : 'unavailable'}
                        />
                        <Badge variant="outline">{command.source}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {command.disabled_reason ||
                          command.description ||
                          'No description provided.'}
                      </p>
                    </div>
                  </div>
                </ClioInteractiveRow>
              ))}
              {!commands.isPending && !commands.data?.length ? (
                <p className="p-5 text-sm text-muted-foreground">
                  No commands were reported for this view.
                </p>
              ) : null}
            </FramePanel>
          </Frame>
        </TabsContent>
      </Tabs>

      <Dialog onOpenChange={setEditorOpen} open={editorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Customize ${editing.title || editing.id}` : 'Create prompt'}
            </DialogTitle>
            <DialogDescription>
              {editing?.scope === 'builtin'
                ? 'The packaged definition stays untouched; saving creates an explicit override.'
                : 'Changes are validated by the connected service before they are saved.'}
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="edit">
            <TabsList>
              <TabsTrigger value="edit">Definition</TabsTrigger>
              <TabsTrigger value="preview">Rendered preview</TabsTrigger>
            </TabsList>
            <TabsContent className="mt-4 grid gap-5" value="edit">
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="prompt-id">Prompt ID</FieldLabel>
                    <Input
                      disabled={Boolean(editing)}
                      id="prompt-id"
                      onChange={(event) => set('id', event.target.value)}
                      value={draft.id}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="prompt-profile">Profile</FieldLabel>
                    {editing && Object.keys(editing.profiles).length ? (
                      <Select onValueChange={chooseProfile} value={draft.profile}>
                        <SelectTrigger aria-label="Prompt profile" id="prompt-profile">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(editing.profiles).map((profile) => (
                            <SelectItem key={profile} value={profile}>
                              {profile}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="prompt-profile"
                        onChange={(event) => set('profile', event.target.value)}
                        value={draft.profile}
                      />
                    )}
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="prompt-title">Title</FieldLabel>
                  <Input
                    id="prompt-title"
                    onChange={(event) => set('title', event.target.value)}
                    value={draft.title}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="prompt-description">Description</FieldLabel>
                  <Input
                    id="prompt-description"
                    onChange={(event) => set('description', event.target.value)}
                    value={draft.description}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="prompt-text">Instructions</FieldLabel>
                  <Textarea
                    className="min-h-64 font-mono text-xs leading-5"
                    id="prompt-text"
                    onChange={(event) => set('text', event.target.value)}
                    value={draft.text}
                  />
                  <FieldDescription>
                    Template placeholders are checked by the service allowlist.
                  </FieldDescription>
                  {validationErrors.length ? (
                    <FieldError>{validationErrors.join(', ')}</FieldError>
                  ) : null}
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field>
                    <FieldLabel>Save for</FieldLabel>
                    <Select
                      onValueChange={(value: 'global' | 'workspace') =>
                        setDraft((current) => ({ ...current, scope: value }))
                      }
                      value={draft.scope}
                    >
                      <SelectTrigger aria-label="Prompt save scope">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">Entire service</SelectItem>
                        <SelectItem value="workspace">Selected workspace</SelectItem>
                      </SelectContent>
                    </Select>
                    {workspaceRequired ? (
                      <FieldError>Select a workspace above first.</FieldError>
                    ) : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="prompt-provider">Provider preference</FieldLabel>
                    <Input
                      id="prompt-provider"
                      onChange={(event) => set('provider', event.target.value)}
                      placeholder="Inherit"
                      value={draft.provider}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="prompt-model">Model preference</FieldLabel>
                    <Input
                      id="prompt-model"
                      onChange={(event) => set('model', event.target.value)}
                      placeholder="Inherit"
                      value={draft.model}
                    />
                  </Field>
                </div>
                {resolved.data ? (
                  <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                    <p>Effective source: {resolved.data.scope}</p>
                    {resolved.data.source_path ? (
                      <p className="mt-1 break-all font-mono">{resolved.data.source_path}</p>
                    ) : null}
                  </div>
                ) : null}
              </FieldGroup>
            </TabsContent>
            <TabsContent className="mt-4 grid gap-4" value="preview">
              <Alert>
                <EyeIcon aria-hidden="true" />
                <AlertTitle>Live render context</AlertTitle>
                <AlertDescription>
                  The preview uses the connected service’s current agents, tools, commands, memory,
                  permissions, provider, and active pack.
                </AlertDescription>
              </Alert>
              {editing ? (
                <Button
                  disabled={preview.isPending}
                  onClick={() => preview.mutate()}
                  variant="outline"
                >
                  {preview.isPending ? <LoaderCircleIcon className="animate-spin" /> : <EyeIcon />}
                  Render effective prompt
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Save this new prompt before rendering it against live context.
                </p>
              )}
              {renderedText ? (
                <CodeBlock className="max-h-96" code={renderedText} language="markdown">
                  <CodeBlockHeader>
                    <CodeBlockTitle>
                      <FileTextIcon aria-hidden="true" className="size-3.5" />
                      <CodeBlockFilename>Effective prompt</CodeBlockFilename>
                    </CodeBlockTitle>
                    <CodeBlockActions>
                      <CodeBlockCopyButton aria-label="Copy effective prompt" />
                    </CodeBlockActions>
                  </CodeBlockHeader>
                </CodeBlock>
              ) : null}
            </TabsContent>
          </Tabs>
          <DialogFooter className="items-center sm:justify-between">
            <Button
              disabled={validate.isPending || !draft.id || !draft.text}
              onClick={() => validate.mutate()}
              variant="outline"
            >
              {validate.isPending ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <CheckCircle2Icon />
              )}
              Validate
            </Button>
            <Button
              disabled={save.isPending || !draft.id || !draft.text || workspaceRequired}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <LoaderCircleIcon className="animate-spin" /> : null}
              Save {draft.scope === 'workspace' ? 'workspace override' : 'service override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => !open && setSelectedCommand(undefined)}
        open={Boolean(selectedCommand)}
      >
        <CommandDetail command={selectedCommand} />
      </Dialog>
    </div>
  );
}
