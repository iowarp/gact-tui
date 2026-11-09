import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Undo2Icon } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import type { ClioModelOption } from '@/lib/model-options';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ModelSelectField } from './model-select-field';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { SettingsGroupLabel, SettingsRow } from './settings-row';

const roles = [
  ['goals', 'Goals', 'Checks evidence of completion and guides the next step.'],
  ['variants', 'Best of N and refinement', 'Evaluates candidate answers and refinements.'],
  [
    'permissions',
    'Automode permissions',
    'Classifies operation risk. High risk requires your approval.',
  ],
  [
    'memory_extract',
    'Memory: noticing facts',
    'Reads finished conversations for facts worth keeping. Unset uses the server default model.',
  ],
  [
    'memory_consolidate',
    'Memory: organizing',
    'Merges, replaces and retires remembered facts. Unset uses the server default model.',
  ],
  [
    'explore',
    'Explore',
    'Runs the read-only explore helper that searches files and data. A fast model keeps wide surveys quick. Unset uses the conversation model.',
  ],
] as const;

interface FleetChoice {
  provider_id: string;
  model_id: string;
}

/**
 * Helper models, as setting rows under the Models page: each role's field
 * opens the one model picker; ↶ returns it to the conversation's model.
 * Null inherits the conversation model (memory roles: the server default).
 */
export function FleetSettingsPanel() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
  const key = ['fleet-settings', settings.endpoint, connectionScope(settings)];
  const fleet = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.fleetSettings(signal),
  });
  const { options, catalog } = useProviderGroups();
  const save = useMutation({
    mutationFn: (input: Parameters<typeof repository.updateFleetSettings>[0]) =>
      repository.updateFleetSettings(input),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  const heading = (
    <SettingsGroupLabel className="mt-6">
      <span id="settings-helper-models">Helper models</span>
    </SettingsGroupLabel>
  );
  if (fleet.isPending)
    return (
      <section aria-labelledby="settings-helper-models">
        {heading}
        <StateView kind="loading" size="row" title="Loading helper models" />
      </section>
    );
  if (fleet.error || !fleet.data)
    return (
      <section aria-labelledby="settings-helper-models">
        {heading}
        <StateView
          action={{ label: 'Retry', onClick: () => void fleet.refetch() }}
          kind="error"
          size="row"
          title="Helper models could not be loaded."
        />
      </section>
    );
  const data = fleet.data;
  const catalogStatus = catalog.isPending ? 'loading' : catalog.isError ? 'error' : 'ready';
  const field = ({
    id,
    title,
    pickerTitle,
    choice,
    unset,
    disabled = false,
    onChoose,
    onReset,
  }: {
    id: string;
    title: string;
    pickerTitle: string;
    choice: FleetChoice | null | undefined;
    unset: string;
    disabled?: boolean;
    onChoose: (model: ClioModelOption) => void;
    onReset: () => void;
  }) => {
    const option = choice
      ? options.find(
          (candidate) =>
            candidate.providerId === choice.provider_id && candidate.id === choice.model_id,
        )
      : undefined;
    return (
      <>
        {choice ? (
          <IconButton
            disabled={save.isPending}
            icon={<Undo2Icon />}
            label="Use conversation model"
            onClick={onReset}
            size="sm"
          />
        ) : (
          // Keeps every helper select at the same left edge, reset or not.
          <span aria-hidden className="size-6 shrink-0" />
        )}
        {/* One fixed width, so a long model name does not widen its own row's column. */}
        <div className="w-[13.5rem] min-w-0 shrink">
          <ModelSelectField
            catalogStatus={catalogStatus}
            disabled={save.isPending || disabled}
            id={id}
            label={title}
            modelId={choice?.model_id}
            onChange={onChoose}
            onRetryCatalog={() => void catalog.refetch()}
            option={option}
            options={options}
            placeholder={unset}
            providerId={choice?.provider_id}
            title={pickerTitle}
          />
        </div>
      </>
    );
  };
  return (
    <section aria-labelledby="settings-helper-models" data-slot="helper-models">
      {heading}
      <SettingsRow
        description={`Answers questions and finds conversations, messages, and files. Press Tab in search to use it.`}
        htmlFor="fleet-search"
        note={
          data.search === undefined ? 'Update this connection’s agent to enable search.' : undefined
        }
        title={`${vocab.agent} Search`}
      >
        {field({
          id: 'fleet-search',
          title: `${vocab.agent} Search`,
          pickerTitle: `Choose ${vocab.agent} Search model`,
          choice: data.search,
          unset: 'Conversation or service model',
          disabled: data.search === undefined,
          onChoose: (model) =>
            save.mutate({ ...data, search: { provider_id: model.providerId, model_id: model.id } }),
          onReset: () => save.mutate({ ...data, search: null }),
        })}
      </SettingsRow>
      {data.spotter !== undefined ? (
        <SettingsRow
          description="Watches actions under SPOTTER review. A conversation can choose its own model."
          htmlFor="fleet-spotter"
          title="SPOTTER review"
        >
          {field({
            id: 'fleet-spotter',
            title: 'SPOTTER review',
            pickerTitle: 'Choose SPOTTER model',
            choice: data.spotter,
            unset: 'Conversation model',
            onChoose: (model) =>
              save.mutate({
                ...data,
                spotter: { provider_id: model.providerId, model_id: model.id },
              }),
            onReset: () => save.mutate({ ...data, spotter: null }),
          })}
        </SettingsRow>
      ) : null}
      {roles
        .filter(([role]) => role in data.judges)
        .map(([role, title, description]) => {
          const choice = data.judges[role];
          // Memory roles never borrow the conversation's model (MD13).
          const unset = role.startsWith('memory_') ? 'Server default model' : 'Conversation model';
          return (
            <SettingsRow
              description={description}
              htmlFor={`fleet-${role}`}
              key={role}
              title={title}
            >
              {field({
                id: `fleet-${role}`,
                title,
                pickerTitle: `Choose ${title} judge`,
                choice,
                unset,
                onChoose: (model) =>
                  save.mutate({
                    ...data,
                    judges: {
                      ...data.judges,
                      [role]: { provider_id: model.providerId, model_id: model.id },
                    },
                  }),
                onReset: () => save.mutate({ ...data, judges: { ...data.judges, [role]: null } }),
              })}
            </SettingsRow>
          );
        })}
      {data.explore_nudge ? (
        <ExploreNudgeSetting
          onChange={(explore_nudge) => save.mutate({ ...data, explore_nudge })}
          pending={save.isPending}
          value={data.explore_nudge}
        />
      ) : null}
      {save.error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {save.error.message}
        </p>
      ) : null}
    </section>
  );
}

/** The explore note: after a run of reading calls, the agent is reminded that explore
 * exists. A suggestion it weighs, never a spawn. */
function ExploreNudgeSetting({
  value,
  pending,
  onChange,
}: {
  value: { enabled: boolean; after: number };
  pending: boolean;
  onChange: (value: { enabled: boolean; after: number }) => void;
}) {
  const [draft, setDraft] = useState<number>();
  const after = draft ?? value.after;
  return (
    <>
      <SettingsRow
        description="After a run of searches and reads, remind the agent that Explore can take over the search. It is a suggestion; the agent decides."
        htmlFor="fleet-explore-nudge"
        inlineControl
        title="Suggest Explore while searching"
      >
        <Switch
          aria-label="Suggest Explore while searching"
          checked={value.enabled}
          disabled={pending}
          id="fleet-explore-nudge"
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </SettingsRow>
      <SettingsRow
        description="How many searches and reads in a row before the suggestion."
        title="Reads before the suggestion"
      >
        <Slider
          aria-label="Reads before the Explore suggestion"
          className="min-w-20 flex-1"
          disabled={pending || !value.enabled}
          max={20}
          min={2}
          onValueChange={(next) => setDraft(next[0])}
          onValueCommit={(next) => {
            if (next[0] !== undefined && next[0] !== value.after)
              onChange({ ...value, after: next[0] });
            setDraft(undefined);
          }}
          step={1}
          value={[after]}
        />
        <span className="w-6 shrink-0 text-right text-xs tabular-nums">{after}</span>
      </SettingsRow>
    </>
  );
}
