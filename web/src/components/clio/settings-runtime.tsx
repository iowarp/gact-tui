import type { RuntimeSetting, RuntimeSettings, UpdateRuntimeSettings } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, RotateCcwIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioSettingsSection } from './settings-section';
import { SettingsRow } from './settings-row';
import { NumberLimitInput } from './number-limit-input';
import { NumericPresetInput } from './numeric-preset-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
export function RuntimeSettingsPanel({
  only,
  exclude = [],
  title = 'Execution & history',
  description,
}: {
  /** Show only this settings group (the memory page shows ``Memory``). */
  only?: string;
  /** Hide these settings groups. */
  exclude?: string[];
  title?: string;
  description?: string;
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
  const copyConfigPath = async () => {
    try {
      await navigator.clipboard.writeText(source?.config_path ?? '');
      toast.success('Configuration path copied');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not copy configuration path');
    }
  };
  const patch = draft ? patchFor(draft) : undefined;
  const heading = (
    <SettingsSectionHeading
      title={title}
      description={
        description ??
        `Global defaults for the connected ${vocab.agent} service. Session and workspace overrides take precedence.`
      }
    />
  );
  if (current.isError && !source)
    return (
      <div className="grid gap-4">
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
      <div className="grid gap-4">
        {heading}
        <p className="text-sm text-muted-foreground">Loading configuration…</p>
      </div>
    );
  const groups = [...new Set(source.settings.map((setting) => setting.group))].filter((group) =>
    only ? group === only : !exclude.includes(group),
  );
  return (
    <div className="grid gap-4">
      {only ? null : heading}
      {groups.map((group) => (
        <ClioSettingsSection
          key={group}
          title={only ? title : group}
          description={
            only && description !== undefined
              ? description
              : group === 'Execution'
                ? 'Choose request budgets and recovery behavior.'
                : group === 'Subagents'
                  ? `Set child-agent limits without restarting ${vocab.agent}. Each agent can also have a smaller parallel-batch limit in Agents.`
                  : group === 'Workflows'
                    ? 'Cap how far a running workflow may grow. Unlimited leaves it to the workflow and the subagent limits.'
                    : group === 'Memory'
                      ? `Choose what ${vocab.agent} remembers about you and how it learns.`
                      : 'Choose how context and response history are saved.'
          }
        >
          <div className="[&_[data-slot=settings-row]]:py-2">
            {source.settings
              .filter((setting) => setting.group === group)
              .map((setting) => {
                const value = draft?.changes[setting.key] ?? displayValue(setting);
                const resetting = draft?.changes[setting.key] === null;
                const id = `runtime-${setting.key}`;
                const unitFactor = setting.unit === 'percent' ? 100 : 1;
                const info = (
                  <div className="grid gap-1">
                    <p>
                      <span className="font-medium">Source:</span> {sourceLabels[setting.source]}
                    </p>
                    <p>
                      <span className="font-medium">Effect:</span> {setting.effect}
                    </p>
                    {setting.has_user_value ? (
                      <p>
                        <span className="font-medium">Reset:</span> removes your saved override and
                        uses the current inherited value.
                      </p>
                    ) : null}
                  </div>
                );
                const disabled = !setting.editable || resetting || save.isPending;
                return (
                  <SettingsRow
                    key={setting.key}
                    title={setting.title}
                    htmlFor={id}
                    inlineControl={setting.kind === 'boolean'}
                    info={info}
                    description={
                      <div className="grid gap-0.5">
                        <p>{setting.description}</p>
                        {setting.reason ? (
                          <p className="text-xs text-muted-foreground">{setting.reason}</p>
                        ) : null}
                        {resetting ? (
                          <p className="text-xs text-muted-foreground">Will inherit after saving</p>
                        ) : null}
                      </div>
                    }
                  >
                    <div className="flex w-full min-w-0 items-center justify-end gap-2">
                      {setting.kind === 'choice' ? (
                        <Select
                          value={String(value)}
                          disabled={disabled}
                          onValueChange={(next) => update(setting, next)}
                        >
                          <SelectTrigger className="w-full max-w-80" id={id}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {setting.choices.map((choice) => (
                              <SelectItem key={choice.value} value={choice.value}>
                                {choice.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : setting.kind === 'boolean' ? (
                        <Switch
                          id={id}
                          checked={Boolean(value)}
                          disabled={disabled}
                          onCheckedChange={(next) => update(setting, next)}
                        />
                      ) : setting.presets?.length ? (
                        <NumericPresetInput
                          id={id}
                          label={setting.title}
                          value={String(value)}
                          presets={setting.presets.map((preset) => ({
                            label: preset.label,
                            value: preset.value * unitFactor,
                          }))}
                          minimum={
                            setting.minimum === null ? undefined : setting.minimum * unitFactor
                          }
                          maximum={
                            setting.maximum === null ? undefined : setting.maximum * unitFactor
                          }
                          step={setting.kind === 'integer' ? 1 : 'any'}
                          unit={setting.unit === 'percent' ? '%' : (setting.unit ?? undefined)}
                          disabled={disabled}
                          onChange={(next) => update(setting, next)}
                        />
                      ) : setting.unlimited_value === 0 ? (
                        <NumberLimitInput
                          id={id}
                          label={setting.title}
                          value={String(value)}
                          defaultValue={Number(setting.default_value)}
                          disabled={disabled}
                          onChange={(next) => update(setting, next)}
                        />
                      ) : (
                        <div className="flex w-full min-w-0 items-center gap-2">
                          <Input
                            className="w-28 text-center"
                            id={id}
                            aria-label={setting.title}
                            type="number"
                            value={String(value)}
                            min={
                              setting.minimum === null ? undefined : setting.minimum * unitFactor
                            }
                            max={
                              setting.maximum === null ? undefined : setting.maximum * unitFactor
                            }
                            step={setting.kind === 'integer' ? 1 : 'any'}
                            disabled={disabled}
                            onChange={(event) => update(setting, event.target.value)}
                          />
                          {setting.unit ? (
                            <span className="text-xs text-muted-foreground">
                              {setting.unit === 'percent' ? '%' : setting.unit}
                            </span>
                          ) : null}
                        </div>
                      )}
                      {!resetting && setting.editable && setting.has_user_value ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Use inherited value"
                          disabled={save.isPending}
                          aria-label={`Use inherited ${setting.title.toLowerCase()}`}
                          onClick={() => update(setting, null)}
                        >
                          <RotateCcwIcon aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </SettingsRow>
                );
              })}
          </div>
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
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Configuration file</span>
        <Button
          aria-label="Copy configuration path"
          className="h-7 min-w-0 max-w-full justify-start gap-1 px-1 font-mono text-xs font-normal"
          title={source.config_path}
          type="button"
          variant="ghost"
          onClick={() => void copyConfigPath()}
        >
          <span className="min-w-0 truncate">{source.config_path}</span>
          <CopyIcon aria-hidden="true" className="size-3.5 shrink-0" />
        </Button>
      </div>
    </div>
  );
}
