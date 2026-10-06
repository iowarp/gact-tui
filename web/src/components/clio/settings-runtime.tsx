import type { RuntimeSetting, RuntimeSettings, UpdateRuntimeSettings } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioSettingsSection } from './settings-section';
import { SettingsRow } from './settings-row';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';

type Draft = { source: RuntimeSettings; changes: Record<string, string | boolean | null> };
const sourceLabels = {
  user: 'Saved in your configuration',
  workspace: 'Workspace configuration',
  environment: 'Environment default',
  default: `${vocab.agent} default`,
};

function displayValue(setting: RuntimeSetting): string | boolean {
  if (typeof setting.value === 'boolean') return setting.value;
  return String(setting.unit === 'percent' ? setting.value * 100 : setting.value);
}

function patchFor(draft: Draft): UpdateRuntimeSettings | undefined {
  const changes: UpdateRuntimeSettings['changes'] = {};
  for (const [key, value] of Object.entries(draft.changes)) {
    const setting = draft.source.settings.find((item) => item.key === key);
    if (!setting) return;
    if (value === null || typeof value === 'boolean') {
      changes[key] = value;
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

/** Edit supported global defaults through the same configuration owner as CLIO. */
export function RuntimeSettingsPanel() {
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
      toast.success('Execution and history defaults saved');
    },
  });
  const update = (setting: RuntimeSetting, value: string | boolean | null) => {
    if (!source) return;
    save.reset();
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
  const patch = draft ? patchFor(draft) : undefined;
  const heading = (
    <SettingsSectionHeading
      title="Execution & history"
      description={`Global defaults for the connected ${vocab.agent} service. Session and workspace overrides take precedence.`}
    />
  );
  if (current.isError && !source)
    return (
      <div className="grid gap-6">
        {heading}
        <Alert variant="destructive">
          <AlertTitle>Configuration unavailable</AlertTitle>
          <AlertDescription>{current.error.message}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => void reload()}>
          Retry loading settings
        </Button>
      </div>
    );
  if (!source)
    return (
      <div className="grid gap-6">
        {heading}
        <p className="text-sm text-muted-foreground">Loading configuration…</p>
      </div>
    );
  const groups = [...new Set(source.settings.map((setting) => setting.group))];
  return (
    <div className="grid gap-6">
      {heading}
      {groups.map((group) => (
        <ClioSettingsSection
          key={group}
          title={group}
          description={
            group === 'Execution'
              ? 'Choose request budgets and recovery behavior.'
              : 'Choose how context and response history are saved.'
          }
        >
          {source.settings
            .filter((setting) => setting.group === group)
            .map((setting) => {
              const value = draft?.changes[setting.key] ?? displayValue(setting);
              const resetting = draft?.changes[setting.key] === null;
              const id = `runtime-${setting.key}`;
              return (
                <SettingsRow
                  key={setting.key}
                  title={setting.title}
                  htmlFor={id}
                  description={
                    <>
                      <p>{setting.description}</p>
                      <p className="mt-1 text-xs">{setting.effect}</p>
                      <p className="mt-1 text-xs">
                        {setting.reason ?? sourceLabels[setting.source]}
                      </p>
                      {resetting ? (
                        <p className="mt-1 text-xs">Will inherit after saving</p>
                      ) : setting.editable && setting.has_user_value ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-auto px-0 py-1 text-xs"
                          disabled={save.isPending}
                          aria-label={`Use inherited ${setting.title.toLowerCase()}`}
                          onClick={() => update(setting, null)}
                        >
                          Use inherited value
                        </Button>
                      ) : null}
                    </>
                  }
                >
                  <div className="grid w-full justify-items-center gap-2">
                    {setting.kind === 'boolean' ? (
                      <Switch
                        id={id}
                        checked={Boolean(value)}
                        disabled={!setting.editable || resetting || save.isPending}
                        onCheckedChange={(next) => update(setting, next)}
                      />
                    ) : (
                      <div className="relative flex w-full justify-center">
                        <Input
                          className="w-28 text-center"
                          id={id}
                          type="number"
                          value={String(value)}
                          min={
                            setting.minimum === null
                              ? undefined
                              : setting.minimum * (setting.unit === 'percent' ? 100 : 1)
                          }
                          max={
                            setting.maximum === null
                              ? undefined
                              : setting.maximum * (setting.unit === 'percent' ? 100 : 1)
                          }
                          step={setting.kind === 'integer' ? 1 : 'any'}
                          disabled={!setting.editable || resetting || save.isPending}
                          onChange={(event) => update(setting, event.target.value)}
                        />
                        {setting.unit ? (
                          <span className="absolute left-[calc(50%+4rem)] top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {setting.unit === 'percent' ? '%' : setting.unit}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </SettingsRow>
              );
            })}
        </ClioSettingsSection>
      ))}
      {save.error ? (
        <Alert variant="destructive">
          <AlertTitle>Settings were not saved</AlertTitle>
          <AlertDescription>{save.error.message} Your edits are still here.</AlertDescription>
        </Alert>
      ) : null}
      {current.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not refresh configuration: {current.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!patch || save.isPending} onClick={() => patch && save.mutate(patch)}>
          {save.isPending ? 'Saving…' : 'Save defaults'}
        </Button>
        <Button
          variant="outline"
          disabled={current.isFetching || save.isPending}
          onClick={() => void reload()}
        >
          {current.isFetching ? 'Loading…' : 'Reload current settings'}
        </Button>
        {draft && !patch ? (
          <p role="alert" className="text-sm text-destructive">
            Enter a number within the allowed range.
          </p>
        ) : null}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Configuration file</summary>
        <p className="mt-2 break-all font-mono">{source.config_path}</p>
        <p className="mt-2">
          Edits save only these preferences. Inherited values come from the environment or{' '}
          {vocab.agent} defaults.
        </p>
      </details>
    </div>
  );
}
