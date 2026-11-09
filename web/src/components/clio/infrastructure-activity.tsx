import type { InfrastructureInventory } from '@clio/core/v3';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { infrastructureServiceName } from '@/lib/infrastructure-service-labels';
import { InfrastructureActivityRow } from './infrastructure-activity-row';
import { InfraFilterMenu, InfraSearchField } from './infrastructure-filter-menu';
import { InfraList } from './infrastructure-row';
import { InfraTabActions } from './infrastructure-tab-actions';
import { StateView } from './primitives/state-view';

type ActivityFilter = 'all' | 'active' | 'failed' | 'completed';
const activeStates = new Set(['queued', 'running']);
const completedStates = new Set(['succeeded', 'ready']);
const stateLabels: Record<string, string> = {
  succeeded: 'Completed',
  ready: 'Completed',
  running: 'Running',
  queued: 'Queued',
  failed: 'Failed',
  cancelled: 'Cancelled',
  removed: 'Removed',
};
const filterLabels: Record<ActivityFilter, string> = {
  all: 'All',
  active: 'In progress',
  failed: 'Failed',
  completed: 'Completed',
};

const sentence = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** Recent operations in one timeline; host and result stay visible before opening details. */
export function InfrastructureActivity({ data }: { data: InfrastructureInventory }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const hosts = new Map(
    data.targets.map((host) => [host.id, host.kind === 'local' ? 'Local' : host.label]),
  );
  const history = [
    ...data.operations.map((operation) => ({
      id: operation.id,
      target: operation.target_id,
      title: sentence(
        `${operation.action.replaceAll('_', ' ')} ${infrastructureServiceName(operation.service_id)}`,
      ),
      state: operation.state,
      time: new Date(operation.updated_at).getTime(),
      detail: operation.error || operation.progress,
      logs: operation.logs,
      model: undefined,
      operation,
    })),
    ...data.model_acquisitions.map((model) => ({
      id: model.id,
      target: model.target_id || 'local',
      title: `Download ${model.repository}`,
      state: model.state,
      time: model.updated_at * 1000,
      detail: model.error || model.phase,
      logs: undefined,
      model,
      operation: undefined,
    })),
  ]
    .sort((a, b) => b.time - a.time)
    .filter((row) =>
      `${row.title} ${stateLabels[row.state] || row.state} ${hosts.get(row.target)} ${row.detail}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    );
  const matchesFilter = (state: string, selected: ActivityFilter) =>
    selected === 'all' ||
    (selected === 'active'
      ? activeStates.has(state)
      : selected === 'completed'
        ? completedStates.has(state)
        : state === 'failed');
  const rows = history.filter((row) => matchesFilter(row.state, filter));
  const filtered = Boolean(search) || filter !== 'all';
  return (
    <>
      <InfraTabActions>
        <InfraSearchField
          label="Search activity"
          onValueChange={setSearch}
          placeholder="Search activity"
          value={search}
        />
        <InfraFilterMenu
          label="Activity filter"
          onValueChange={setFilter}
          options={(['all', 'active', 'failed', 'completed'] as const).map((value) => ({
            value,
            label: filterLabels[value],
            count: history.filter((row) => matchesFilter(row.state, value)).length,
          }))}
          value={filter}
        />
      </InfraTabActions>
      {rows.length ? (
        <InfraList hover={52} label="Infrastructure activity">
          {rows.map((row) => (
            <InfrastructureActivityRow
              key={row.target + ':' + row.id}
              row={row}
              host={hosts.get(row.target) || row.target}
              status={stateLabels[row.state] || row.state}
            />
          ))}
        </InfraList>
      ) : filtered ? (
        <StateView
          action={{
            label: 'Clear filters',
            onClick: () => {
              setSearch('');
              setFilter('all');
            },
          }}
          kind="empty"
          size="row"
          title="No matching activity."
        />
      ) : (
        <StateView kind="empty" size="row" title="No infrastructure operations yet.">
          <div className="ml-auto flex shrink-0 gap-1.5">
            <Button asChild size="xs" variant="outline">
              <Link to="/infrastructure/services">Set up a service</Link>
            </Button>
            <Button asChild size="xs" variant="outline">
              <Link to="/infrastructure/models">Download a model</Link>
            </Button>
          </div>
        </StateView>
      )}
    </>
  );
}
