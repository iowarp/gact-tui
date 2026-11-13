import { ROW_STATE_WRAP, SETTINGS_COLUMN } from '@/lib/settings-fold';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import type { SessionDefaults } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ServerIcon } from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { useRef, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { useInstalledAgents } from '@/hooks/use-session-agent';
import { useSpotterAvailability } from '@/hooks/use-spotter-availability';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { approvalOptionViews, unavailableApprovalNotice } from './approval-option-availability';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  compactModelName,
  findSelectedModelOption,
  type ClioModelOption,
} from '@/lib/model-options';
import { useModelReasoningLevels } from '@/hooks/use-model-reasoning-levels';
import { IconButton } from './primitives/icon-button';
import { ModelSelectField } from './model-select-field';
import { StateView } from './primitives/state-view';
import { SettingsRow } from './settings-row';
import { ReasoningLevelSegmented } from './reasoning-level-segmented';
import { sessionDefaultsPatch } from './session-defaults-patch';
import { SettingsSectionHeading } from './settings-section-heading';
import {
  SESSION_APPROVAL_OPTIONS,
  SESSION_MODE_OPTIONS,
  SESSION_MODE_PATCHES,
} from './session-behavior-options';
import { t, ph } from '@lingui/core/macro';

const serviceDefaultAgent = '__default__';

/** Every select trigger in the panel, the shared reasoning field included, takes the field shape (C). */
const FIELDS =
  '[&_[data-slot=select-trigger]]:w-full [&_[data-slot=select-trigger]]:min-w-0 [&_[data-slot=select-trigger]]:px-[9px] [&_[data-slot=select-trigger]]:text-menu [&_[data-slot=select-trigger][data-size=default]]:h-[1.875rem] [&_[data-slot=select-trigger][data-size=default]]:rounded-md';

function SectionHeading() {
  return (
    <>
      <SettingsSectionHeading
        title={t`Session defaults`}
        description={t`Choose how new sessions start.`}
      />
    </>
  );
}

function Footnote({ saving, target }: { saving: boolean; target: string }) {
  return (
    <p
      aria-live="polite"
      className="flex h-[1.875rem] min-w-0 items-center gap-2 text-xs whitespace-nowrap text-muted-foreground"
      data-slot="settings-footnote"
    >
      <ServerIcon aria-hidden="true" className="size-[0.8125rem] shrink-0" />
      <span className="min-w-0 truncate">
        {saving ? t`Saving to ${target}…` : t`Saved to ${target}.`}
      </span>
    </p>
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
  const agents = useInstalledAgents();
  const [draft, setDraft] = useState<{
    source?: SessionDefaults;
    value?: SessionDefaults;
  }>({});
  const latest = useRef<SessionDefaults | undefined>(undefined);
  const form = draft.source === defaults.data ? draft.value : defaults.data;

  const save = useMutation({
    // An unset effort is sent as null: use the selected model's own default.
    mutationFn: (value: SessionDefaults) =>
      repository.updateSessionDefaults(sessionDefaultsPatch(value)),
    onSuccess: (value, sent) => {
      // A slower earlier write must not overwrite a newer choice.
      if (sent !== latest.current) return;
      setDraft({ source: value, value });
      queryClient.setQueryData(queryKeys.key('session-defaults', settings.endpoint), value);
    },
  });

  /** Choices apply at once: show the new value and write it to the service. */
  const setForm = (value: SessionDefaults) => {
    latest.current = value;
    setDraft({ source: defaults.data, value });
    save.mutate(value);
  };

  const providerId = form?.provider_id || modelConfiguration.data?.provider_id;
  const modelId = form?.provider_id ? form.model_id : modelConfiguration.data?.model;
  const selectedModel = findSelectedModelOption(options, providerId, modelId);
  const reasoning = useModelReasoningLevels(
    providerId,
    modelId,
    form?.provider_id ? undefined : modelConfiguration.data?.resolved_model_id,
  );

  const target = settings.label?.trim() || t`the connected agent`;

  if (defaults.error) {
    return (
      <div>
        <SectionHeading />
        <div className={cn('w-full border-b border-border/70 py-1', SETTINGS_COLUMN)}>
          <StateView
            action={{ label: t`Retry`, onClick: () => void defaults.refetch() }}
            className={ROW_STATE_WRAP}
            kind="error"
            size="row"
            title={t`Session defaults could not be loaded.`}
          />
        </div>
      </div>
    );
  }

  if (defaults.isPending || !form) {
    return (
      <div>
        <SectionHeading />
        <div className={cn('w-full border-b border-border/70 py-1', SETTINGS_COLUMN)}>
          <StateView
            kind="loading"
            size="row"
            title={t`Loading defaults from the connected service…`}
          />
        </div>
      </div>
    );
  }

  const update = <Key extends keyof SessionDefaults>(key: Key, value: SessionDefaults[Key]) =>
    setForm({ ...form, [key]: value });
  const agentValue = form.agent_ref || serviceDefaultAgent;
  const selectedMode =
    SESSION_MODE_OPTIONS.find((option) => option.value === form.mode) ?? SESSION_MODE_OPTIONS[0];
  const selectedApproval =
    approvalOptions.find((option) => option.value === form.approval_mode) ?? approvalOptions[0];
  const pinned = Boolean(form.provider_id);
  const modelName = selectedModel
    ? `${selectedModel.providerName ? `${selectedModel.providerName} / ` : ''}${compactModelName(selectedModel.id, selectedModel.label)}`
    : modelId || t`Choose model`;

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
    <div>
      <SectionHeading />
      <div className={FIELDS} data-slot="session-defaults-panel">
        <SettingsRow
          htmlFor="session-default-model"
          title={t`Model`}
          info={
            pinned
              ? t`This model is pinned for new sessions. Reset it to follow the model in Models settings.`
              : t`New sessions follow the model in Models settings. Choose a model here to pin it for new sessions.`
          }
        >
          <div className="flex w-full min-w-0 items-center gap-1.5">
            <ModelSelectField
              catalogStatus={
                catalog.isPending && !catalog.data
                  ? 'loading'
                  : catalog.error && !catalog.data
                    ? 'error'
                    : 'ready'
              }
              id="session-default-model"
              inherited={!pinned}
              label={t`Change default model`}
              // The effective model reads as the value whether inherited or pinned;
              // the reset button beside it marks a pin.
              modelId={modelId}
              onChange={chooseModel}
              onRetryCatalog={(id) => catalog.refreshCatalog(id)}
              option={selectedModel}
              options={options}
              placeholder={modelName}
              providerId={providerId}
              title={t`Choose a model for new sessions`}
            />
            {pinned ? (
              <IconButton
                className="shrink-0 text-muted-foreground"
                icon={<RetryIcon />}
                label={t`Use model from Models settings`}
                onClick={() => setForm({ ...form, provider_id: '', model_id: '' })}
              />
            ) : null}
          </div>
        </SettingsRow>
        {reasoning?.levels.length ? (
          <SettingsRow
            info={
              form.effort === 'unknown'
                ? t`The service reported a starting effort this build does not know; saving resets it to the model default.`
                : t`The starting thinking depth for new sessions. You can change it again from the composer.`
            }
            title={t`Reasoning effort`}
            wideControl
          >
            <ReasoningLevelSegmented
              onChange={(effort) => update('effort', effort || undefined)}
              reasoning={reasoning}
              value={form.effort && form.effort !== 'unknown' ? form.effort : ''}
            />
          </SettingsRow>
        ) : null}
        <SettingsRow
          htmlFor="session-default-agent"
          title={t`Agent`}
          info={t`The agent new sessions run. Its plugins bring tools, skills and guidance; you can still add or remove plugins in a conversation.`}
        >
          <Select
            onValueChange={(value) =>
              update('agent_ref', value === serviceDefaultAgent ? '' : value)
            }
            value={agentValue}
          >
            <SelectTrigger id="session-default-agent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={serviceDefaultAgent}>{t`Service default`}</SelectItem>
              {agents.data?.map((agent) => (
                <SelectItem key={agent.ref} value={agent.ref}>
                  {agent.name || agent.id}
                  {agent.kind === 'user' ? ' (yours)' : ''}
                </SelectItem>
              ))}
              {form.agent_ref && !agents.data?.some((agent) => agent.ref === form.agent_ref) ? (
                <SelectItem
                  value={form.agent_ref}
                >{t`${ph({ agent_ref: form.agent_ref })} (not installed)`}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow
          htmlFor="session-default-mode"
          title={t`Work mode`}
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
              {SESSION_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow
          htmlFor="session-default-approval"
          title={t`Confirmations`}
          info={
            <>
              {t`${ph({ description: selectedApproval.description })} Workspace and organization rules still apply.`}
            </>
          }
          note={unavailableApprovalNotice(approvalOptions)}
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
              {approvalOptions.map((option) => (
                <SelectItem disabled={option.disabled} key={option.value} value={option.value}>
                  {option.label}
                  {option.disabled ? ' (unavailable)' : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </div>
      {save.isError ? (
        <div className={cn('w-full py-1', SETTINGS_COLUMN)}>
          <StateView
            action={{
              label: t`Retry`,
              onClick: () => {
                if (latest.current) save.mutate(latest.current);
              },
            }}
            kind="error"
            size="row"
            title={t`Your change could not be saved.`}
          />
        </div>
      ) : (
        <Footnote saving={save.isPending} target={target} />
      )}
    </div>
  );
}
