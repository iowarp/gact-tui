import { vocab } from '@/lib/brand-vocabulary';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClioModelPicker } from './model-picker';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';

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

/** Independent evaluator choices; null inherits the conversation model. */
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
  if (fleet.isPending) return <p role="status">Loading Fleet…</p>;
  if (fleet.error || !fleet.data)
    return (
      <div role="alert">
        Fleet could not be loaded. <Button onClick={() => void fleet.refetch()}>Retry</Button>
      </div>
    );
  const data = fleet.data;
  return (
    <section className="flex max-w-3xl flex-col gap-4" aria-label="Fleet models">
      <div>
        <h2 className="text-lg font-semibold">Fleet</h2>
        <p className="text-sm text-muted-foreground">
          Choose models for search and evaluation. By default, each uses the conversation’s model.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b py-3">
        <div className="min-w-48 flex-1">
          <h3 className="font-medium">{vocab.agent} Search</h3>
          <p className="text-sm text-muted-foreground">
            Answers questions and finds conversations, messages, and files. Press Tab in search to
            use it.
            {data.search === undefined ? ' Update this connection’s agent to enable search.' : ''}
          </p>
        </div>
        <ClioModelPicker
          title={`Choose ${vocab.agent} Search model`}
          options={options}
          model={data.search?.model_id}
          provider={data.search?.provider_id}
          catalogStatus={catalog.isPending ? 'loading' : catalog.isError ? 'error' : 'ready'}
          onRetryCatalog={() => void catalog.refetch()}
          trigger={
            <Button variant="outline" disabled={save.isPending || data.search === undefined}>
              {data.search?.model_id ?? 'Conversation or service model'}
            </Button>
          }
          onChange={(model) =>
            save.mutate({ ...data, search: { provider_id: model.providerId, model_id: model.id } })
          }
        />
        {data.search ? (
          <Button
            variant="ghost"
            disabled={save.isPending}
            onClick={() => save.mutate({ ...data, search: null })}
          >
            Use conversation model
          </Button>
        ) : null}
      </div>
      {data.spotter !== undefined ? (
        <div className="flex flex-wrap items-center gap-3 border-b py-3">
          <div className="min-w-48 flex-1">
            <h3 className="font-medium">SPOTTER review</h3>
            <p className="text-sm text-muted-foreground">
              Watches actions under SPOTTER review. A conversation can choose its own model.
            </p>
          </div>
          <ClioModelPicker
            title="Choose SPOTTER model"
            options={options}
            model={data.spotter?.model_id}
            provider={data.spotter?.provider_id}
            catalogStatus={catalog.isPending ? 'loading' : catalog.isError ? 'error' : 'ready'}
            onRetryCatalog={() => void catalog.refetch()}
            trigger={
              <Button variant="outline" disabled={save.isPending}>
                {data.spotter?.model_id ?? 'Conversation model'}
              </Button>
            }
            onChange={(model) =>
              save.mutate({
                ...data,
                spotter: { provider_id: model.providerId, model_id: model.id },
              })
            }
          />
          {data.spotter ? (
            <Button
              variant="ghost"
              disabled={save.isPending}
              onClick={() => save.mutate({ ...data, spotter: null })}
            >
              Use conversation model
            </Button>
          ) : null}
        </div>
      ) : null}
      {roles
        .filter(([role]) => role in data.judges)
        .map(([role, title, description]) => {
          const choice = data.judges[role];
          // Memory roles never borrow the conversation's model (MD13).
          const unset = role.startsWith('memory_') ? 'Server default model' : 'Conversation model';
          return (
            <div key={role} className="flex flex-wrap items-center gap-3 border-b py-3">
              <div className="min-w-48 flex-1">
                <h3 className="font-medium">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
              <ClioModelPicker
                title={`Choose ${title} judge`}
                options={options}
                model={choice?.model_id}
                provider={choice?.provider_id}
                catalogStatus={catalog.isPending ? 'loading' : catalog.isError ? 'error' : 'ready'}
                onRetryCatalog={() => void catalog.refetch()}
                trigger={
                  <Button variant="outline" disabled={save.isPending}>
                    {choice?.model_id ?? unset}
                  </Button>
                }
                onChange={(model) =>
                  save.mutate({
                    ...data,
                    judges: {
                      ...data.judges,
                      [role]: { provider_id: model.providerId, model_id: model.id },
                    },
                  })
                }
              />
              {choice ? (
                <Button
                  variant="ghost"
                  disabled={save.isPending}
                  onClick={() => save.mutate({ ...data, judges: { ...data.judges, [role]: null } })}
                >
                  Use conversation model
                </Button>
              ) : null}
            </div>
          );
        })}
      {data.explore_nudge ? (
        <ExploreNudgeSetting
          value={data.explore_nudge}
          pending={save.isPending}
          onChange={(explore_nudge) => save.mutate({ ...data, explore_nudge })}
        />
      ) : null}
      {save.error ? <p role="alert">{save.error.message}</p> : null}
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
    <div className="flex flex-col gap-3 border-b py-3">
      <label className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-48 flex-1">
          <span className="block font-medium">Suggest Explore while searching</span>
          <span className="block text-sm text-muted-foreground">
            After a run of searches and reads, remind the agent that Explore can take over the
            search. It is a suggestion; the agent decides.
          </span>
        </span>
        <Switch
          aria-label="Suggest Explore while searching"
          checked={value.enabled}
          disabled={pending}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </label>
      <div className="flex items-center gap-3 text-sm">
        <span className="min-w-48">Reads before the suggestion</span>
        <Slider
          aria-label="Reads before the Explore suggestion"
          min={2}
          max={20}
          step={1}
          value={[after]}
          disabled={pending || !value.enabled}
          onValueChange={(next) => setDraft(next[0])}
          onValueCommit={(next) => {
            if (next[0] !== undefined && next[0] !== value.after) onChange({ ...value, after: next[0] });
            setDraft(undefined);
          }}
        />
        <span className="tabular-nums">{after}</span>
      </div>
    </div>
  );
}
