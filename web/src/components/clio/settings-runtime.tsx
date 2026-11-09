import { SETTINGS_COLUMN } from '@/lib/settings-fold';
import { cn } from '@/lib/utils';
import type { RuntimeSetting, RuntimeSettings, UpdateRuntimeSettings } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { IconButton } from './primitives/icon-button';
import { SaveBar } from './primitives/save-bar';
import { StateView } from './primitives/state-view';
import { SettingsLoadError } from './settings-health-load-error';
import { plainReason } from './settings-health-reason';
import { RuntimeSettingControl } from './settings-runtime-control';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';

type Draft = { source: RuntimeSettings; changes: Record<string, string | boolean | null> };
const sourceLabels = {
  user: 'Saved in your configuration',
  workspace: 'Workspace configuration',
  environment: 'Environment default',
  default: `${vocab.agent} default`,
};

const groupInfo: Record<string, string> = {
  Execution: 'Choose request budgets and recovery behavior.',
  Subagents: `Set child-agent limits without restarting ${vocab.agent}. Each agent can also have a smaller parallel-batch limit in Agents.`,
  Workflows:
    'Cap how far a running workflow may grow. Unlimited leaves it to the workflow and the subagent limits.',
  Memory: `Choose what ${vocab.agent} remembers about you and how it learns.`,
  Browser: `Choose the browser that shows the pages ${vocab.agent} opens. It runs on the computer ${vocab.agent} runs on.`,
};

function displayValue(setting: RuntimeSetting): string | boolean {
  if (typeof setting.value === 'boolean' || typeof setting.value === 'string') return setting.value;
  return String(setting.unit === 'percent' ? setting.value * 100 : setting.value);
}

function patchFor(draft: Draft): UpdateRuntimeSettings | undefined {
  const changes: UpdateRuntimeSettings['changes'] = {};
  for (const [key, value] of Object.entries(draft.changes)) {
    const setting = draft.source.settings.find((item) => item.key === key);
    if (!setting) return;
    if (value === null || typeof value === 'boolean' || setting.kind === 'choice') {
      changes[key] = value;
      continue;
    }
    if (setting.kind === 'text') {
      // An emptied field removes the saved value, so the setting is unset again.
      changes[key] = value.trim() ? value.trim() : null;
      continue;
    }
    if (!value.trim()) return;
    const parsed = Number(value) / (setting.unit === 'percent' ? 100 : 1);
    if (
      !Number.isFinite(parsed) ||
      (setting.kind === 'integer' && !Number.isInteger(parsed)) ||
      (setting.kind === 'number' && setting.minimum === 0 && parsed === 0) ||
      (setting.minimum !== null && parsed < setting.minimum) ||
      (setting.maximum !== null && parsed > setting.maximum)
    )
      return;
    changes[key] = parsed;
  }
  return { revision: draft.source.revision, changes };
}

function SettingInfo({ setting }: { setting: RuntimeSetting }) {
  return (
    <div className="grid gap-1">
      {setting.description ? <p>{setting.description}</p> : null}
      <p>
        <span className="font-medium">Source:</span> {sourceLabels[setting.source]}
      </p>
      <p>
        <span className="font-medium">Effect:</span> {setting.effect}
      </p>
      {setting.has_user_value ? (
        <p>
          <span className="font-medium">Reset:</span> removes your saved override and uses the
          current inherited value.
        </p>
      ) : null}
    </div>
  );
}

/** Edit supported global defaults through the same configuration owner as CLIO. */
export function RuntimeSettingsPanel({
  only,
  exclude = [],
  title = 'Execution & history',
  description,
  headingLevel = 1,
  insertBefore,
  subsections = {},
}: {
  /** 2 when the panel is folded into another settings page. */
  headingLevel?: 1 | 2;
  /** Show only this settings group (the memory page shows ``Memory``). */
  only?: string;
  /** Hide these settings groups. */
  exclude?: string[];
  title?: string;
  description?: string;
  /** Content placed before a group (or at the end when the service has no such group). */
  insertBefore?: { group: string; content: ReactNode };
  /** Groups shown as their own titled part of the page, by navigation anchor. */
  subsections?: Record<string, string>;
} = {}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
  const key = queryKeys.key('runtime-settings', connectionScope(settings));
  const current = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.runtimeSettings(signal),
  });
  const [draft, setDraft] = useState<Draft>();
  const source = draft?.source ?? current.data;
  const save = useMutation({
    mutationFn: (input: UpdateRuntimeSettings) => repository.updateRuntimeSettings(input),
    onSuccess: (value) => {
      client.setQueryData(key, value);
      setDraft(undefined);
      toast.success(`${title} settings saved`);
    },
  });
  // Switches and choices apply at once; typed values wait for the save bar.
  const apply = useMutation({
    mutationFn: (input: UpdateRuntimeSettings) => repository.updateRuntimeSettings(input),
    onSuccess: (value) => {
      client.setQueryData(key, value);
      setDraft((previous) => (previous ? { ...previous, source: value } : previous));
    },
  });
  const update = (setting: RuntimeSetting, value: string | boolean | null) => {
    if (!source) return;
    save.reset();
    if (
      value !== null &&
      (setting.kind === 'boolean' || setting.kind === 'choice') &&
      draft?.changes[setting.key] === undefined
    ) {
      if (value === displayValue(setting)) return;
      apply.reset();
      apply.mutate({ revision: source.revision, changes: { [setting.key]: value } });
      return;
    }
    const changes = { ...draft?.changes };
    if (value === displayValue(setting)) delete changes[setting.key];
    else changes[setting.key] = value;
    setDraft(Object.keys(changes).length ? { source, changes } : undefined);
  };
  const reload = async () => {
    const result = await current.refetch();
    if (result.isSuccess) {
      setDraft(undefined);
      save.reset();
    }
  };
  const copyConfigPath = async () => {
    try {
      await navigator.clipboard.writeText(source?.config_path ?? '');
      toast.success('Configuration path copied');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not copy configuration path');
    }
  };
  const patch = draft ? patchFor(draft) : undefined;
  const hint =
    description ??
    `Global defaults for the connected ${vocab.agent} service. Session and workspace overrides take precedence.`;
  const heading =
    !only || headingLevel === 2 ? (
      <SettingsSectionHeading info={hint || undefined} level={headingLevel} title={title} />
    ) : null;
  const trailing = insertBefore?.content;
  if (current.isError && !source)
    return (
      <div className="grid gap-1">
        {heading}
        <SettingsLoadError
          error={current.error}
          onRetry={() => void reload()}
          retrying={current.isFetching}
          title="Configuration unavailable."
        />
        {trailing}
      </div>
    );
  if (!source)
    return (
      <div className="grid gap-1">
        {heading}
        <StateView kind="loading" size="row" title="Loading configuration…" />
        {trailing}
      </div>
    );
  const groups = [...new Set(source.settings.map((setting) => setting.group))].filter((group) =>
    only ? group === only : !exclude.includes(group),
  );
  const inserted = insertBefore && groups.includes(insertBefore.group);
  const changeCount = Object.keys(draft?.changes ?? {}).length;
  const renderGroup = (group: string) => {
    const anchor = subsections[group];
    const info =
      only && description !== undefined
        ? description
        : (groupInfo[group] ?? 'Choose how context and response history are saved.');
    return (
      <section
        aria-label={only ? undefined : group}
        className={anchor ? 'scroll-mt-4' : undefined}
        data-settings-anchor={anchor}
      >
        {only && !anchor ? null : (
          <SettingsGroupLabel info={info || undefined}>{group}</SettingsGroupLabel>
        )}
        {source.settings
          .filter((setting) => setting.group === group)
          .map((setting) => {
            const value = draft?.changes[setting.key] ?? displayValue(setting);
            const resetting = draft?.changes[setting.key] === null;
            return (
              <SettingsRow
                dirty={draft?.changes[setting.key] !== undefined}
                htmlFor={`runtime-${setting.key}`}
                info={<SettingInfo setting={setting} />}
                inlineControl={setting.kind === 'boolean'}
                key={setting.key}
                note={resetting ? 'Will inherit after saving' : (setting.reason ?? undefined)}
                title={setting.title}
              >
                <RuntimeSettingControl
                  canReset={!resetting && setting.editable && setting.has_user_value}
                  disabled={!setting.editable || resetting || save.isPending || apply.isPending}
                  id={`runtime-${setting.key}`}
                  onChange={(next) => update(setting, next)}
                  resetDisabled={save.isPending}
                  setting={setting}
                  value={value}
                />
              </SettingsRow>
            );
          })}
      </section>
    );
  };
  return (
    <div className="grid">
      {heading}
      {groups.map((group) => (
        <Fragment key={group}>
          {inserted && insertBefore.group === group ? <div>{insertBefore.content}</div> : null}
          {renderGroup(group)}
        </Fragment>
      ))}
      {insertBefore && !inserted ? <div>{insertBefore.content}</div> : null}
      <SettingsGroupLabel>Configuration</SettingsGroupLabel>
      <SettingsRow title="Configuration file">
        <Button
          aria-label="Copy configuration path"
          className="h-7 max-w-full min-w-0 justify-start gap-1.5 px-1.5 font-mono text-xs font-normal text-muted-foreground"
          onClick={() => void copyConfigPath()}
          title={source.config_path}
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 truncate">{source.config_path}</span>
          <CopyIcon aria-hidden="true" className="size-3.5 shrink-0" />
        </Button>
        <IconButton
          disabled={current.isFetching || save.isPending}
          icon={<RetryIcon />}
          label="Reload current settings"
          onClick={() => void reload()}
          size="sm"
        />
      </SettingsRow>
      {current.isError ? (
        <SettingsLoadError
          error={current.error}
          onRetry={() => void reload()}
          retrying={current.isFetching}
          title="Could not refresh configuration."
        />
      ) : null}
      {apply.isError ? (
        <SettingsLoadError error={apply.error} title="That change was not applied." />
      ) : null}
      <SaveBar
        className={cn('sticky bottom-0 z-10 bg-background', SETTINGS_COLUMN)}
        count={changeCount}
        error={
          save.error
            ? `${plainReason(save.error)} Your edits are still here.`
            : draft && !patch
              ? 'Enter a number within the allowed range.'
              : undefined
        }
        invalid={Boolean(draft && !patch)}
        onDiscard={() => {
          setDraft(undefined);
          save.reset();
        }}
        onSave={() => patch && save.mutate(patch)}
        saving={save.isPending}
      />
    </div>
  );
}
