import { queryKeys } from '@/lib/query-keys';
import type { SessionDefaults } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { SaveIcon } from '@/lib/icon-vocabulary';
import { useState } from 'react';
import { toast } from 'sonner';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Frame, FrameFooter, FramePanel } from '@/components/clio/settings-frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { useSpotterAvailability } from '@/hooks/use-spotter-availability';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { approvalOptionViews, unavailableApprovalNotice } from './approval-option-availability';
import { useConnectionSettings } from '@/providers/connection-provider';
import { providerLogoId } from '@/lib/provider-presentation';
import { findSelectedModelOption, type ClioModelOption } from '@/lib/model-options';
import { useModelReasoningLevels } from '@/hooks/use-model-reasoning-levels';
import { SettingsRow } from './settings-row';
import { ReasoningLevelField } from './reasoning-level-field';
import { sessionDefaultsPatch } from './session-defaults-patch';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioModelPicker } from './model-picker';
import { composerModelLabel } from './composer-model-label';
import {
  SESSION_APPROVAL_OPTIONS,
  SESSION_MODE_OPTIONS,
  SESSION_MODE_PATCHES,
} from './session-behavior-options';

const standardBlueprint = '__standard__';

function SectionHeading() {
  return (
    <SettingsSectionHeading
      title="New session defaults"
      info="Choose how newly created sessions begin. Existing sessions keep their current agent, model, work mode and access rules."
    />
  );
}

/** Starting choices for new sessions, using the composer's shared model picker. */
export function SessionDefaultsSettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const approvalOptions = approvalOptionViews(SESSION_APPROVAL_OPTIONS, useSpotterAvailability(''));
  const { settings } = useConnectionSettings();
  const defaults = useQuery({
    queryKey: queryKeys.key('session-defaults', settings.endpoint),
    queryFn: ({ signal }) => repository.sessionDefaults(signal),
  });
  const { configuration: modelConfiguration, catalog, options } = useProviderGroups();
  const blueprints = useQuery({
    queryKey: queryKeys.key('agent-blueprints', settings.endpoint, 'session-defaults'),
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

  const providerId = form?.provider_id || modelConfiguration.data?.provider_id;
  const modelId = form?.provider_id ? form.model_id : modelConfiguration.data?.model;
  const selectedModel = findSelectedModelOption(options, providerId, modelId);
  const reasoning = useModelReasoningLevels(
    providerId,
    modelId,
    form?.provider_id ? undefined : modelConfiguration.data?.resolved_model_id,
  );

  const save = useMutation({
    // An unset effort is sent as null: use the selected model's own default.
    mutationFn: (value: SessionDefaults) =>
      repository.updateSessionDefaults(sessionDefaultsPatch(value)),
    onSuccess: (value) => {
      setDraft({ source: value, value });
      queryClient.setQueryData(queryKeys.key('session-defaults', settings.endpoint), value);
      toast.success('New session defaults saved');
    },
    onError: (error) => toast.error(error.message),
  });

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

  const update = <Key extends keyof SessionDefaults>(key: Key, value: SessionDefaults[Key]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  const blueprintValue = form.blueprint_id || standardBlueprint;
  const selectedMode =
    SESSION_MODE_OPTIONS.find((option) => option.value === form.mode) ?? SESSION_MODE_OPTIONS[0];
  const selectedApproval =
    approvalOptions.find((option) => option.value === form.approval_mode) ?? approvalOptions[0];

  function chooseModel(choice: ClioModelOption) {
    if (!form) return;
    setForm({
      ...form,
      provider_id: choice.providerId,
      model_id: choice.id,
      effort:
        form.effort && form.effort !== 'unknown' && choice.reasoning?.levels.includes(form.effort)
          ? form.effort
          : undefined,
    });
  }

  return (
    <div className="grid gap-6">
      <SectionHeading />
      <Frame className="max-w-2xl" data-slot="session-defaults-panel">
        <FramePanel>
          <FieldGroup className="gap-0">
            <SettingsRow
              htmlFor="session-default-model"
              title="Model"
              info="Follow the model in Models settings, or choose a specific provider and model for new sessions."
            >
              <div className="flex max-w-full flex-col items-center gap-1.5">
                <ClioModelPicker
                  catalogStatus={
                    catalog.isPending && !catalog.data
                      ? 'loading'
                      : catalog.error && !catalog.data
                        ? 'error'
                        : 'ready'
                  }
                  // Inheritance is the effective model, not a pinned choice.
                  // Selecting that same row must be able to create an override.
                  model={form.provider_id ? (selectedModel?.id ?? modelId) : undefined}
                  onChange={chooseModel}
                  onRetryCatalog={(id) => catalog.refreshCatalog(id)}
                  options={options}
                  provider={providerId}
                  title="Choose a model for new sessions"
                  trigger={
                    <Button
                      aria-label="Change default model"
                      className="max-w-full"
                      id="session-default-model"
                      type="button"
                      variant="outline"
                    >
                      {providerId ? (
                        <ModelSelectorLogo provider={providerLogoId(providerId)} />
                      ) : null}
                      <span className="truncate">
                        {selectedModel
                          ? composerModelLabel(selectedModel)
                          : modelId || 'Choose model'}
                      </span>
                      <ChevronDownIcon aria-hidden="true" />
                    </Button>
                  }
                />
                {form.provider_id ? (
                  <Button
                    className="h-auto py-1 text-xs text-muted-foreground"
                    onClick={() => setForm({ ...form, provider_id: '', model_id: '' })}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Use Models default
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Models default</span>
                )}
              </div>
            </SettingsRow>
            <ReasoningLevelField
              allowModelDefault
              info={
                form.effort === 'unknown'
                  ? 'The service reported a starting effort this build does not know; saving resets it to the model default.'
                  : 'The starting thinking depth for new sessions. You can change it again from the composer.'
              }
              id="session-default-effort"
              layout="row"
              onChange={(effort) => update('effort', effort)}
              reasoning={reasoning}
              value={form.effort}
            />
            <SettingsRow
              htmlFor="session-default-blueprint"
              title="Agent"
              info="An agent blueprint adds its experts, tools and instructions to new sessions."
            >
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
                        {blueprint.materialized === false ? ' · Installs when used' : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </SettingsRow>
            <SettingsRow
              htmlFor="session-default-mode"
              title="Work mode"
              info={selectedMode.description}
            >
              <Select
                onValueChange={(value) => {
                  const patch = SESSION_MODE_PATCHES[value as SessionDefaults['mode']];
                  setForm({ ...form, ...patch });
                }}
                value={form.mode}
              >
                <SelectTrigger id="session-default-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_MODE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <Icon aria-hidden="true" className="size-4" /> {option.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </SettingsRow>
            <SettingsRow
              htmlFor="session-default-approval"
              title="Confirmations"
              info={
                <>{selectedApproval.description} Workspace and organization rules still apply.</>
              }
              description={unavailableApprovalNotice(approvalOptions)}
            >
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
                  {approvalOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <SelectItem
                        disabled={option.disabled}
                        key={option.value}
                        value={option.value}
                      >
                        <Icon aria-hidden="true" className="size-4" /> {option.label}
                        {option.disabled ? ' (unavailable)' : null}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </SettingsRow>
          </FieldGroup>
        </FramePanel>
        <FrameFooter>
          <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
            <SaveIcon aria-hidden="true" />
            {save.isPending ? 'Saving…' : 'Save defaults'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Saved to {settings.label?.trim() || 'the connected agent'}.
          </p>
        </FrameFooter>
      </Frame>
    </div>
  );
}
