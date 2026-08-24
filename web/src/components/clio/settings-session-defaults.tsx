import type { SessionDefaults } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotIcon, BrainCircuitIcon, ShieldCheckIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { providerDisplayName } from '@/lib/provider-presentation';

const inheritedModel = '__service_default__';
const standardBlueprint = '__standard__';

function SectionHeading() {
  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Settings</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">New session defaults</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Choose how newly created sessions begin. Existing sessions keep their current agent, model,
        working mode, and access rules.
      </p>
    </header>
  );
}

export function SessionDefaultsSettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const defaults = useQuery({
    queryKey: ['session-defaults', settings.endpoint],
    queryFn: ({ signal }) => repository.sessionDefaults(signal),
  });
  const modelConfiguration = useQuery({
    queryKey: ['language-model-configuration', settings.endpoint],
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
  const blueprints = useQuery({
    queryKey: ['agent-blueprints', settings.endpoint, 'session-defaults'],
    queryFn: ({ signal }) => repository.agentBlueprints(undefined, signal),
  });
  const [draft, setDraft] = useState<{
    source?: SessionDefaults;
    value?: SessionDefaults;
  }>({});
  const form = draft.source === defaults.data ? draft.value : defaults.data;
  const setForm = (
    next:
      | SessionDefaults
      | undefined
      | ((current: SessionDefaults | undefined) => SessionDefaults | undefined),
  ) => {
    const value = typeof next === 'function' ? next(form) : next;
    setDraft({ source: defaults.data, value });
  };

  const selectedPreset = modelConfiguration.data?.presets.find(
    (preset) => preset.id === form?.provider_id || preset.provider === form?.provider_id,
  );
  const modelCatalog = useQuery({
    enabled: Boolean(form?.provider_id && selectedPreset?.is_authenticated),
    queryKey: ['provider-models', settings.endpoint, form?.provider_id],
    queryFn: ({ signal }) => repository.providerModels(form?.provider_id ?? '', signal),
  });
  const modelOptions = useMemo(() => {
    const rows = modelCatalog.data?.models ?? [];
    if (rows.length) return rows;
    const fallback = [form?.model_id, selectedPreset?.suggested_model].filter(
      (value): value is string => Boolean(value),
    );
    return [...new Set(fallback)].map((id) => ({ id, name: id }));
  }, [form?.model_id, modelCatalog.data?.models, selectedPreset?.suggested_model]);

  const save = useMutation({
    mutationFn: (value: SessionDefaults) => repository.updateSessionDefaults(value),
    onSuccess: (value) => {
      setDraft({ source: value, value });
      queryClient.setQueryData(['session-defaults', settings.endpoint], value);
      toast.success('New session defaults saved');
    },
    onError: (error) => toast.error(error.message),
  });

  if (defaults.isPending || !form) {
    return (
      <div className="grid gap-6">
        <SectionHeading />
        <Frame>
          <FramePanel className="p-8 text-sm text-muted-foreground">
            Loading defaults from the connected service…
          </FramePanel>
        </Frame>
      </div>
    );
  }

  if (defaults.error) {
    return (
      <div className="grid gap-6">
        <SectionHeading />
        <Alert variant="destructive">
          <AlertTitle>New session defaults unavailable</AlertTitle>
          <AlertDescription>{defaults.error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const update = <Key extends keyof SessionDefaults>(key: Key, value: SessionDefaults[Key]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  const modelValue = form.provider_id ? form.provider_id : inheritedModel;
  const blueprintValue = form.blueprint_id || standardBlueprint;

  return (
    <div className="grid gap-6">
      <SectionHeading />
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle className="flex items-center gap-2">
            <BrainCircuitIcon aria-hidden="true" className="size-4 text-primary" /> Model and
            reasoning
          </FrameTitle>
          <FrameDescription>
            Inherit the service model or pin new sessions to another available model.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="session-default-provider">Model source</FieldLabel>
              <Select
                onValueChange={(value) => {
                  if (value === inheritedModel) {
                    setForm({ ...form, provider_id: '', model_id: '' });
                    return;
                  }
                  const preset = modelConfiguration.data?.presets.find((item) => item.id === value);
                  setForm({
                    ...form,
                    provider_id: value,
                    model_id: preset?.suggested_model ?? '',
                  });
                }}
                value={modelValue}
              >
                <SelectTrigger id="session-default-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={inheritedModel}>
                    Use Models default
                    {modelConfiguration.data?.model ? ` — ${modelConfiguration.data.model}` : ''}
                  </SelectItem>
                  {modelConfiguration.data?.presets.map((preset) => (
                    <SelectItem
                      disabled={!preset.is_authenticated}
                      key={preset.id}
                      value={preset.id}
                    >
                      {providerDisplayName(preset)}
                      {preset.is_authenticated ? '' : ' — sign-in needed'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {form.provider_id ? (
              <Field>
                <FieldLabel htmlFor="session-default-model">Model</FieldLabel>
                <Select
                  disabled={modelCatalog.isFetching}
                  onValueChange={(value) => update('model_id', value)}
                  value={form.model_id}
                >
                  <SelectTrigger id="session-default-model">
                    <SelectValue placeholder="Choose a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name ?? ('label' in model ? model.label : undefined) ?? model.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {modelCatalog.error
                    ? `Live choices unavailable: ${modelCatalog.error.message}`
                    : modelCatalog.data?.source
                      ? `Choices reported by ${modelCatalog.data.source}.`
                      : 'Availability comes from the connected service.'}
                </FieldDescription>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="session-default-effort">Reasoning effort</FieldLabel>
              <Select
                onValueChange={(value) => update('effort', value as SessionDefaults['effort'])}
                value={form.effort}
              >
                <SelectTrigger id="session-default-effort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                Sets the default thinking depth for newly created sessions. You can change it again
                from the composer.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FramePanel>
      </Frame>

      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle className="flex items-center gap-2">
            <BotIcon aria-hidden="true" className="size-4 text-primary" /> Agent and working style
          </FrameTitle>
          <FrameDescription>
            A domain blueprint can add experts, tools, and instructions to every new session.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="session-default-blueprint">Agent blueprint</FieldLabel>
              <Select
                onValueChange={(value) =>
                  update('blueprint_id', value === standardBlueprint ? '' : value)
                }
                value={blueprintValue}
              >
                <SelectTrigger id="session-default-blueprint">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={standardBlueprint}>Standard agent</SelectItem>
                  {blueprints.data
                    ?.filter((blueprint) => blueprint.enabled)
                    .map((blueprint) => (
                      <SelectItem key={blueprint.id} value={blueprint.id}>
                        {blueprint.display_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="session-default-mode">Working mode</FieldLabel>
                <Select
                  onValueChange={(value) => update('mode', value as SessionDefaults['mode'])}
                  value={form.mode}
                >
                  <SelectTrigger id="session-default-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="edit">Build and edit</SelectItem>
                    <SelectItem value="plan">Plan before acting</SelectItem>
                    <SelectItem value="architect">Architecture</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="session-default-edit-style">Change style</FieldLabel>
                <Select
                  onValueChange={(value) =>
                    update('edit_mode', value as SessionDefaults['edit_mode'])
                  }
                  value={form.edit_mode}
                >
                  <SelectTrigger id="session-default-edit-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diff">Reviewable changes</SelectItem>
                    <SelectItem value="patch">Targeted patches</SelectItem>
                    <SelectItem value="whole">Replace whole files</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="session-default-routing">How work is routed</FieldLabel>
              <Select
                onValueChange={(value) =>
                  update('routing_mode', value as SessionDefaults['routing_mode'])
                }
                value={form.routing_mode}
              >
                <SelectTrigger id="session-default-routing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatic</SelectItem>
                  <SelectItem value="chat">Conversation only</SelectItem>
                  <SelectItem value="experts">Use domain experts</SelectItem>
                  <SelectItem value="reasoning_only">Reasoning only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </FramePanel>
      </Frame>

      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle className="flex items-center gap-2">
            <ShieldCheckIcon aria-hidden="true" className="size-4 text-primary" /> Protected actions
          </FrameTitle>
          <FrameDescription>
            Choose the starting review policy. Workspace and organization rules still apply.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <Field>
            <FieldLabel htmlFor="session-default-approval">Default review</FieldLabel>
            <Select
              onValueChange={(value) =>
                update('approval_mode', value as SessionDefaults['approval_mode'])
              }
              value={form.approval_mode}
            >
              <SelectTrigger id="session-default-approval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask">Ask me</SelectItem>
                <SelectItem value="auto-edits">Allow workspace edits</SelectItem>
                <SelectItem value="ai-review">AI review</SelectItem>
                <SelectItem value="spotter-ai">SPOTTER review</SelectItem>
                <SelectItem value="bypass">Bypass prompts — unsafe</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </FramePanel>
        <FrameFooter className="items-start">
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
              <SlidersHorizontalIcon aria-hidden="true" />
              {save.isPending ? 'Saving…' : 'Save new session defaults'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Saved to {settings.label?.trim() || 'the connected agent'}.
            </p>
          </div>
        </FrameFooter>
      </Frame>
    </div>
  );
}
