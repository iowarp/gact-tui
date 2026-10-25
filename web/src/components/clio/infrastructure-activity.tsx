import type { InfrastructureInventory } from '@clio/core/v3';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { infrastructureServiceName } from '@/lib/infrastructure-service-labels';

import { InfrastructureActivityRow } from './infrastructure-activity-row';

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
      title: `${operation.action.replaceAll('_', ' ')} ${infrastructureServiceName(operation.service_id)}`,
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
  return (
    <section className="mt-6" aria-label="Infrastructure activity">
      <Input
        aria-label="Search activity"
        placeholder="Search actions, computers or results"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div aria-label="Activity status" className="mt-3 flex flex-wrap items-center gap-2">
        {(['all', 'active', 'failed', 'completed'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? 'secondary' : 'ghost'}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {{ all: 'All', active: 'In progress', failed: 'Failed', completed: 'Completed' }[value]}{' '}
            <span className="text-xs tabular-nums text-muted-foreground">
              {history.filter((row) => matchesFilter(row.state, value)).length}
            </span>
          </Button>
        ))}
      </div>
      <div className="mt-4 divide-y border-y">
        {rows.length ? (
          rows.map((row) => (
            <InfrastructureActivityRow
              key={row.target + ':' + row.id}
              row={row}
              host={hosts.get(row.target) || row.target}
              status={stateLabels[row.state] || row.state}
            />
          ))
        ) : (
          <div className="py-6 text-sm text-muted-foreground">
            <p>
              {search || filter !== 'all'
                ? 'No matching activity.'
                : 'No infrastructure operations yet.'}
            </p>
            {search || filter !== 'all' ? (
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                }}
              >
                Clear filters
              </Button>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/infrastructure/services">Set up a service</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/infrastructure/models">Download a model</Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
