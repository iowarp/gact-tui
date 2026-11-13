import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useFleetSettings } from '@/hooks/use-fleet-settings';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { BILLING_ORDER, billingLabel } from '@/lib/fleet-usage';
import type { ClioModelOption } from '@/lib/model-options';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { DelegationSwitch } from './delegation-switch';
import { FleetModelField, type FleetChoice } from './fleet-model-field';
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
    'Reads finished conversations for facts worth keeping.',
  ],
  ['memory_consolidate', 'Memory: organizing', 'Merges, replaces and retires remembered facts.'],
  [
    'explore',
    'Explore',
    'Runs the read-only explore helper that searches files and data. A fast model keeps wide surveys quick.',
  ],
] as const;

/**
 * Helper models, as setting rows under the Models page: one global choice
 * (the fast model, on the Models rows above) that every helper runs on, and
 * a per-helper override that ↶ returns to it. Then which accounts delegated
 * work may use. An older agent without a fast model keeps its own defaults:
 * the conversation's model, the server default for memory.
 */
export function FleetSettingsPanel() {
  const { query: fleet, save } = useFleetSettings();
  const { options, catalog } = useProviderGroups();
  const heading = (
    <SettingsGroupLabel className="mt-6">
      <span id="settings-helper-models">Helper models</span>
    </SettingsGroupLabel>
  );
  if (fleet.isPending)
    return (
      <section aria-labelledby="settings-helper-models">
        {heading}
        <StateView kind="loading" size="row" title="Loading helper models…" />
      </section>
    );
  if (fleet.error || !fleet.data)
    return (
      <section aria-labelledby="settings-helper-models">
        {heading}
        <div className="w-full @3xl:w-[60%]" title={fleet.error?.message}>
          <StateView
            action={{ label: 'Retry', onClick: () => void fleet.refetch() }}
            kind="error"
            size="row"
            title="The agent could not load helper models."
          />
        </div>
      </section>
    );
  const data = fleet.data;
  const fastKnown = data.fast !== undefined;
  const catalogStatus = catalog.isPending ? 'loading' : catalog.isError ? 'error' : 'ready';
  const field = (props: {
    id: string;
    title: string;
    pickerTitle: string;
    choice: FleetChoice | null | undefined;
    unset: string;
    disabled?: boolean;
    onChoose: (model: ClioModelOption) => void;
    onReset: () => void;
  }) => (
    <FleetModelField
      busy={save.isPending}
      catalogStatus={catalogStatus}
      choice={props.choice}
      disabled={props.disabled}
      id={props.id}
      label={props.title}
      onChoose={props.onChoose}
      onReset={props.onReset}
      onRetryCatalog={() => void catalog.refetch()}
      options={options}
      pickerTitle={props.pickerTitle}
      resetLabel={fastKnown ? 'Use the fast model' : 'Use conversation model'}
      unset={props.unset}
    />
  );
  return (
    <section aria-labelledby="settings-helper-models" data-slot="helper-models">
      <SettingsGroupLabel
        className="mt-6"
        info={
          fastKnown
            ? 'Each helper runs on the fast model unless you choose one for it here.'
            : undefined
        }
      >
        <span id="settings-helper-models">Helper models</span>
      </SettingsGroupLabel>
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
          unset: fastKnown ? 'Fast model' : 'Conversation or service model',
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
            unset: fastKnown ? 'Fast model' : 'Conversation model',
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
          const unset = fastKnown
            ? 'Fast model'
            : role.startsWith('memory_')
              ? 'Server default model'
              : 'Conversation model';
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
      <DelegationSettings />
    </section>
  );
}

/**
 * Delegation: one switch per connected account, whether the agent may run
 * delegated work on it without asking. An account that is off is asked about
 * once per conversation. The same switch shows on each Usage row.
 */
function DelegationSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const fleet = useQuery({
    queryKey: queryKeys.key('fleet', settings.endpoint),
    queryFn: ({ signal }) => repository.fleet({}, signal),
  });
  const accounts = [...(fleet.data?.accounts ?? [])].sort(
    (a, b) => BILLING_ORDER.indexOf(a.billing) - BILLING_ORDER.indexOf(b.billing),
  );
  return (
    <div data-settings-anchor="delegation" data-slot="delegation-settings">
      <SettingsGroupLabel
        info={`Turn an account on to let ${vocab.agent} run delegated work on it without asking. An account that is off is asked about once per conversation.`}
      >
        <span id="settings-delegation">Delegation</span>
      </SettingsGroupLabel>
      {fleet.isPending ? (
        <StateView kind="loading" size="row" title="Loading accounts…" />
      ) : fleet.error ? (
        <div className="w-full @3xl:w-[60%]" title={fleet.error.message}>
          <StateView
            action={{ label: 'Retry', onClick: () => void fleet.refetch() }}
            kind="error"
            size="row"
            title="The agent could not load accounts."
          />
        </div>
      ) : accounts.length ? (
        accounts.map((account) => (
          <SettingsRow
            description={billingLabel(account.billing)}
            htmlFor={`delegation-models-${account.id}`}
            inlineControl
            key={account.id}
            title={account.label}
          >
            <DelegationSwitch
              account={account}
              id={`delegation-models-${account.id}`}
              size="default"
            />
          </SettingsRow>
        ))
      ) : (
        <StateView kind="empty" size="row" title="No account connected" />
      )}
    </div>
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
  const [typed, setTyped] = useState<string>();
  const after = draft ?? value.after;
  const commit = (next: number | undefined) => {
    if (next !== undefined && next !== value.after) onChange({ ...value, after: next });
    setDraft(undefined);
  };
  const commitTyped = () => {
    if (typed === undefined) return;
    const next = Number(typed);
    setTyped(undefined);
    if (Number.isInteger(next)) commit(Math.min(20, Math.max(2, next)));
  };
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
        description="How many searches and reads in a row before the suggestion, from 2 to 20."
        htmlFor="fleet-explore-after"
        title="Reads before the suggestion"
      >
        <Slider
          aria-label="Reads before the Explore suggestion"
          className="w-[34%] min-w-[5.625rem] shrink-0"
          disabled={pending || !value.enabled}
          max={20}
          min={2}
          onValueChange={(next) => setDraft(next[0])}
          onValueCommit={(next) => commit(next[0])}
          step={1}
          thumbProps={() => ({ 'aria-label': 'Reads before the Explore suggestion' })}
          value={[after]}
        />
        <Input
          aria-label="Reads before the Explore suggestion, as a number"
          className="w-[4.5rem] shrink-0 px-2 text-right font-mono text-xs tabular-nums md:text-xs"
          // While a number is typed, Esc only reverts it; the window's Esc listener runs first.
          data-escape-scope={typed === undefined ? undefined : ''}
          disabled={pending || !value.enabled}
          id="fleet-explore-after"
          inputMode="numeric"
          onBlur={commitTyped}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitTyped();
            if (event.key === 'Escape') setTyped(undefined);
          }}
          value={typed ?? String(after)}
        />
      </SettingsRow>
    </>
  );
}
