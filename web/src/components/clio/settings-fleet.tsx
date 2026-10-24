import { vocab } from '@/lib/brand-vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClioModelPicker } from './model-picker';
import { Button } from '@/components/ui/button';
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
      {save.error ? <p role="alert">{save.error.message}</p> : null}
    </section>
  );
}
