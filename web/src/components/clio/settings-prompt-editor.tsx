import type { PromptDefinition } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, FileTextIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfoTip } from './info-tip';
import { DialogFrame } from './primitives/dialog-frame';
import { SegmentedControl } from './primitives/segmented-control';
import { StateView } from './primitives/state-view';
import { scopeLabel } from './settings-prompt-scope';
import { SettingsRow } from './settings-row';
import { ph, t } from '@lingui/core/macro';

const FIELD = 'h-[1.875rem] text-menu';
const SELECT = 'h-[1.875rem]! w-full text-menu';
const INVALID = t`Fix the validation errors before saving.`;

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

/**
 * Creates a prompt or customizes one as an explicit override. The service validates
 * the text before saving, and the preview renders it against the live agent context.
 */
export function PromptEditorDialog({
  prompt: editing,
  workspaceId,
  onClose,
}: {
  prompt?: PromptDefinition;
  workspaceId: string;
  onClose: () => void;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const ids = useId();
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [draft, setDraft] = useState<PromptDraft>(() =>
    editing ? draftForPrompt(editing) : emptyDraft,
  );
  const [validationErrors, setValidationErrors] = useState<string[]>(
    () => editing?.validation_errors ?? [],
  );
  const [renderedText, setRenderedText] = useState('');
  const context = workspaceId ? { workspaceId } : {};
  const resolved = useQuery({
    queryKey: queryKeys.key('prompt', settings.endpoint, editing?.id, draft.profile, workspaceId),
    queryFn: ({ signal }) =>
      repository.prompt(editing?.id ?? '', { ...context, profile: draft.profile }, signal),
    enabled: Boolean(editing?.id),
  });
  const preview = useMutation({
    mutationFn: () => repository.renderPrompt(draft.id, { ...context, profile: draft.profile }),
    onSuccess: (result) => setRenderedText(result.text),
    onError: () => toast.error(t`The prompt couldn’t be rendered. Try again.`),
  });
  const validate = useMutation({
    mutationFn: () =>
      repository.validatePrompt(draft.id, { ...context, profile: draft.profile, text: draft.text }),
    onSuccess: (result) => {
      setValidationErrors(result.validation_errors);
      if (result.enabled) toast.success(t`Prompt is valid`);
    },
    onError: () => toast.error(t`The prompt couldn’t be checked. Try again.`),
  });
  const save = useMutation({
    mutationFn: async () => {
      const result = await repository.validatePrompt(draft.id, {
        ...context,
        profile: draft.profile,
        text: draft.text,
      });
      setValidationErrors(result.validation_errors);
      if (!result.enabled) throw new Error(INVALID);
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.key('prompts', settings.endpoint),
      });
      onClose();
      toast.success(editing ? t`Prompt override saved` : t`Prompt created`);
    },
    onError: (error) =>
      toast.error(t`Prompt was not saved`, {
        description: error.message === INVALID ? INVALID : t`Try again.`,
      }),
  });

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
  const profiles = editing ? Object.keys(editing.profiles) : [];

  return (
    <DialogFrame
      confirm={{
        label: save.isPending
          ? t`Saving…`
          : draft.scope === 'workspace'
            ? t`Save workspace override`
            : t`Save service override`,
        onConfirm: () => save.mutate(),
        disabled: save.isPending || !draft.id || !draft.text || workspaceRequired,
      }}
      description={
        editing?.scope === 'builtin'
          ? t`The packaged definition stays untouched; saving creates an explicit override.`
          : t`The connected service validates changes before they are saved.`
      }
      icon={<FileTextIcon className="size-3.5" />}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      secondary={
        <Button
          className="mr-auto"
          disabled={validate.isPending || !draft.id || !draft.text}
          onClick={() => validate.mutate()}
          variant="outline"
        >
          {validate.isPending ? <Spinner /> : null}
          {t`Validate`}
        </Button>
      }
      title={
        editing ? t`Customize ${ph({ prompt: editing.title || editing.id })}` : t`Create prompt`
      }
      titleActions={
        <SegmentedControl
          className="mr-1"
          label={t`Prompt view`}
          onValueChange={setMode}
          options={[
            { value: 'edit', label: t`Definition` },
            { value: 'preview', label: t`Preview` },
          ]}
          value={mode}
        />
      }
    >
      <div className="clio-scrollbar -mx-[18px] -mt-3 max-h-[min(62dvh,34rem)] overflow-y-auto px-[18px] pt-1">
        {mode === 'edit' ? (
          <>
            <SettingsRow htmlFor={`${ids}-id`} title={t`Prompt ID`}>
              <Input
                autoComplete="off"
                className={cn(FIELD, 'font-mono')}
                data-initial-focus={editing ? undefined : ''}
                disabled={Boolean(editing)}
                id={`${ids}-id`}
                onChange={(event) => set('id', event.target.value)}
                spellCheck={false}
                value={draft.id}
              />
            </SettingsRow>
            <SettingsRow htmlFor={`${ids}-profile`} title={t`Profile`}>
              {profiles.length ? (
                <Select onValueChange={chooseProfile} value={draft.profile}>
                  <SelectTrigger
                    aria-label={t`Prompt profile`}
                    className={SELECT}
                    id={`${ids}-profile`}
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile) => (
                      <SelectItem key={profile} value={profile}>
                        {profile}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className={FIELD}
                  id={`${ids}-profile`}
                  onChange={(event) => set('profile', event.target.value)}
                  value={draft.profile}
                />
              )}
            </SettingsRow>
            <SettingsRow htmlFor={`${ids}-title`} title={t`Title`}>
              <Input
                className={FIELD}
                data-initial-focus={editing ? '' : undefined}
                id={`${ids}-title`}
                onChange={(event) => set('title', event.target.value)}
                value={draft.title}
              />
            </SettingsRow>
            <SettingsRow htmlFor={`${ids}-description`} title={t`Description`}>
              <Input
                className={FIELD}
                id={`${ids}-description`}
                onChange={(event) => set('description', event.target.value)}
                value={draft.description}
              />
            </SettingsRow>
            <div className="border-b border-border/70 pt-1.5 pb-2.5">
              <div className="flex h-7 items-center gap-1.5">
                <Label className="text-ui font-normal" htmlFor={`${ids}-text`}>
                  {t`Instructions`}
                </Label>
                <InfoTip className="text-faint" label={t`About Instructions`}>
                  {t`Template placeholders are checked by the service allowlist.`}
                </InfoTip>
              </div>
              <Textarea
                className="min-h-48 font-mono text-xs leading-5"
                id={`${ids}-text`}
                onChange={(event) => set('text', event.target.value)}
                spellCheck={false}
                value={draft.text}
              />
              {validationErrors.length ? (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {validationErrors.join(', ')}
                </p>
              ) : null}
            </div>
            <SettingsRow
              error={workspaceRequired ? t`Select a workspace in the toolbar first.` : undefined}
              title={t`Save for`}
            >
              <Select
                onValueChange={(value: 'global' | 'workspace') =>
                  setDraft((current) => ({ ...current, scope: value }))
                }
                value={draft.scope}
              >
                <SelectTrigger aria-label={t`Prompt save scope`} className={SELECT} size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">{t`Entire service`}</SelectItem>
                  <SelectItem value="workspace">{t`Selected workspace`}</SelectItem>
                </SelectContent>
              </Select>
            </SettingsRow>
            <SettingsRow htmlFor={`${ids}-provider`} title={t`Provider`}>
              <Input
                className={FIELD}
                id={`${ids}-provider`}
                onChange={(event) => set('provider', event.target.value)}
                placeholder={t`Inherit`}
                value={draft.provider}
              />
            </SettingsRow>
            <SettingsRow htmlFor={`${ids}-model`} title={t`Model`}>
              <Input
                className={FIELD}
                id={`${ids}-model`}
                onChange={(event) => set('model', event.target.value)}
                placeholder={t`Inherit`}
                value={draft.model}
              />
            </SettingsRow>
            {resolved.data ? (
              <div className="grid gap-0.5 pt-2 text-label text-muted-foreground">
                <p>{t`Effective source: ${ph({ source: scopeLabel(resolved.data.scope) })}`}</p>
                {resolved.data.source_path ? (
                  <p className="truncate font-mono" title={resolved.data.source_path}>
                    {resolved.data.source_path}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="grid gap-3 pb-1">
            <p className="text-label text-muted-foreground">
              {t`The preview uses the connected service’s current agents, tools, commands, memory, permissions, provider and active pack.`}
            </p>
            {editing ? (
              <Button
                className="w-fit"
                disabled={preview.isPending}
                onClick={() => preview.mutate()}
                size="sm"
                variant="outline"
              >
                {preview.isPending ? <Spinner /> : <EyeIcon aria-hidden="true" />}
                {t`Render effective prompt`}
              </Button>
            ) : (
              <StateView
                kind="empty"
                size="row"
                title={t`Save this new prompt before rendering it against live context`}
              />
            )}
            {renderedText ? (
              <CodeBlock className="max-h-96" code={renderedText} language="markdown">
                <CodeBlockHeader>
                  <CodeBlockTitle>
                    <FileTextIcon aria-hidden="true" className="size-3.5" />
                    <CodeBlockFilename>{t`Effective prompt`}</CodeBlockFilename>
                  </CodeBlockTitle>
                  <CodeBlockActions>
                    <CodeBlockCopyButton aria-label={t`Copy effective prompt`} />
                  </CodeBlockActions>
                </CodeBlockHeader>
              </CodeBlock>
            ) : null}
          </div>
        )}
      </div>
    </DialogFrame>
  );
}
