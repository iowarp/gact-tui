import { queryKeys } from '@/lib/query-keys';
import type { CommandDefinition, PromptDefinition } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { humanizeToolName } from './tool-presentation';

export function commandKey(command: CommandDefinition) {
  return `${command.kind}:${command.qualified_id}:${command.source}`;
}

export interface PromptDraft {
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

const SCOPE_LABELS: Record<string, string> = {
  builtin: 'Built-in',
  global: 'Entire service',
  workspace: 'Workspace',
};

export function promptScopeLabel(scope: string) {
  return SCOPE_LABELS[scope] ?? humanizeToolName(scope);
}

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

/** Draft, validation, preview and save for one prompt, or a new one when `prompt` is absent. */
export function usePromptEditor({
  prompt,
  workspaceId,
  onSaved,
}: {
  prompt?: PromptDefinition;
  workspaceId: string;
  onSaved: () => void;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [draft, setDraft] = useState<PromptDraft>(() =>
    prompt ? draftForPrompt(prompt) : emptyDraft,
  );
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [renderedText, setRenderedText] = useState('');
  const context = workspaceId ? { workspaceId } : {};
  const resolved = useQuery({
    queryKey: queryKeys.key('prompt', settings.endpoint, prompt?.id, draft.profile, workspaceId),
    queryFn: ({ signal }) =>
      repository.prompt(prompt?.id ?? '', { ...context, profile: draft.profile }, signal),
    enabled: Boolean(prompt?.id),
  });
  const preview = useMutation({
    mutationFn: () => repository.renderPrompt(draft.id, { ...context, profile: draft.profile }),
    onSuccess: (result) => setRenderedText(result.text),
    onError: (error) => toast.error('Could not render prompt', { description: error.message }),
  });
  const validate = useMutation({
    mutationFn: () =>
      repository.validatePrompt(draft.id, { ...context, profile: draft.profile, text: draft.text }),
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.key('prompts', settings.endpoint),
      });
      toast.success(prompt ? 'Prompt override saved' : 'Prompt created');
      onSaved();
    },
    onError: (error) => toast.error('Prompt was not saved', { description: error.message }),
  });
  const chooseProfile = (profileName: string) => {
    const profile = prompt?.profiles[profileName];
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
  const saveLabel = `Save ${draft.scope === 'workspace' ? 'workspace override' : 'service override'}`;
  return {
    prompt,
    draft,
    set,
    setScope: (scope: PromptDraft['scope']) => setDraft((current) => ({ ...current, scope })),
    chooseProfile,
    validationErrors,
    renderedText,
    resolved: resolved.data,
    preview,
    validate,
    save,
    workspaceRequired,
    saveLabel,
    canValidate: !validate.isPending && Boolean(draft.id && draft.text),
    canSave: !save.isPending && Boolean(draft.id && draft.text) && !workspaceRequired,
  };
}

export type PromptEditor = ReturnType<typeof usePromptEditor>;
