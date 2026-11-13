import type { InfrastructureInventory } from '@clio/core/v3';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { infrastructureServiceName } from '@/lib/infrastructure-service-labels';
import { InfrastructureActivityRow } from './infrastructure-activity-row';
import { InfraFilterMenu, InfraSearchField } from './infrastructure-filter-menu';
import { InfraList } from './infrastructure-row';
import { InfraTabActions } from './infrastructure-tab-actions';
import { MenuRow } from './primitives/menu-row';
import { StateView } from './primitives/state-view';
import { t, ph } from '@lingui/core/macro';

type ActivityFilter = 'all' | 'active' | 'failed' | 'completed';
const activeStates = new Set(['queued', 'running']);
const completedStates = new Set(['succeeded', 'ready']);
const stateLabels: Record<string, string> = {
  succeeded: t`Completed`,
  ready: t`Completed`,
  running: t`Running`,
  queued: t`Queued`,
  failed: t`Failed`,
  cancelled: t`Cancelled`,
  removed: t`Removed`,
};
const filterLabels: Record<ActivityFilter, string> = {
  all: t`All`,
  active: t`In progress`,
  failed: t`Failed`,
  completed: t`Completed`,
};

const SEARCH_LABEL = t`Search actions, computers or results`;

const sentence = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** "Start vLLM": the agent's operation verbs in words, its own wording for any other. */
function operationTitle(action: string, serviceId: string): string {
  const name = infrastructureServiceName(serviceId);
  switch (action) {
    case 'install':
      return t`Install ${ph({ label: name })}`;
    case 'start':
      return t`Start ${ph({ label: name })}`;
    case 'stop':
      return t`Stop ${ph({ label: name })}`;
    case 'restart':
      return t`Restart ${ph({ label: name })}`;
    case 'update':
    case 'upgrade':
      return t`Update ${ph({ label: name })}`;
    case 'remove':
    case 'uninstall':
      return t`Remove ${ph({ label: name })}`;
    default:
      return sentence(`${action.replaceAll('_', ' ')} ${name}`);
  }
}

/** Recent operations in one timeline; host and result stay visible before opening details. */
export function InfrastructureActivity({ data }: { data: InfrastructureInventory }) {
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const narrowSearch = useRef<HTMLDivElement>(null);
  const searchShown = searchOpen || Boolean(search);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const hosts = new Map(
    data.targets.map((host) => [host.id, host.kind === 'local' ? t`Local` : host.label]),
  );
  const history = [
    ...data.operations.map((operation) => ({
      id: operation.id,
      target: operation.target_id,
      title: operationTitle(operation.action.toLocaleLowerCase(), operation.service_id),
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
      title: t`Download ${ph({ repository: model.repository })}`,
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
  const filterOptions = (['all', 'active', 'failed', 'completed'] as const).map((value) => ({
    value,
    label: filterLabels[value],
    count: history.filter((row) => matchesFilter(row.state, value)).length,
  }));
  const filterMenu = (
    <InfraFilterMenu
      label={t`Activity filter`}
      onValueChange={setFilter}
      options={filterOptions}
      value={filter}
    />
  );
  const focusSearch = useRef(false);
  const openNarrowSearch = () => {
    focusSearch.current = true;
    setSearchOpen(true);
  };
  return (
    <>
      <InfraTabActions
        fold={{
          label: t`Activity actions`,
          onCloseAutoFocus: (event) => {
            if (!focusSearch.current) return;
            focusSearch.current = false;
            event.preventDefault();
            narrowSearch.current?.querySelector('input')?.focus();
          },
          verb: (
            <>
              <InfraSearchField
                label={SEARCH_LABEL}
                onValueChange={setSearch}
                placeholder={SEARCH_LABEL}
                value={search}
              />
              {filterMenu}
            </>
          ),
          menu: (
            <>
              <DropdownMenuItem onSelect={openNarrowSearch}>
                <MenuRow icon={<SearchIcon aria-hidden="true" />} label={t`Search`} />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {filterOptions.map((option) => (
                <DropdownMenuItem key={option.value} onSelect={() => setFilter(option.value)}>
                  <MenuRow
                    checked={option.value === filter}
                    label={option.label}
                    value={String(option.count)}
                  />
                </DropdownMenuItem>
              ))}
            </>
          ),
        }}
      />
      {/* Under 600px the bar holds only ⋯; an open search or a chosen filter stays visible here. */}
      {searchShown || filter !== 'all' ? (
        <div
          className="mb-1.5 hidden min-w-0 items-center gap-1.5 @max-[600px]/infra-page:flex"
          ref={narrowSearch}
        >
          {searchShown ? (
            <InfraSearchField
              className="w-auto flex-1"
              label={SEARCH_LABEL}
              onEscape={() => setSearchOpen(false)}
              onValueChange={setSearch}
              placeholder={SEARCH_LABEL}
              value={search}
            />
          ) : (
            <span className="flex-1" />
          )}
          {filterMenu}
        </div>
      ) : null}
      {rows.length ? (
        <InfraList hover={26} label={t`Infrastructure activity`}>
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
            label: t`Clear filters`,
            onClick: () => {
              setSearch('');
              setFilter('all');
            },
          }}
          kind="empty"
          size="row"
          title={t`No matching activity.`}
        />
      ) : (
        <StateView kind="empty" size="row" title={t`No infrastructure operations yet.`}>
          <div className="ml-auto flex shrink-0 gap-1.5">
            <Button asChild size="xs" variant="outline">
              <Link to="/infrastructure/services">{t`Set up a service`}</Link>
            </Button>
            <Button asChild size="xs" variant="outline">
              <Link to="/infrastructure/models">{t`Download a model`}</Link>
            </Button>
          </div>
        </StateView>
      )}
    </>
  );
}
