import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConnectedSourceState, NDPDataset, SourceProvider } from '@clio/core/v3';
import { CheckIcon, CircleAlertIcon, SearchIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from './primitives/segmented-control';
import { cn } from '@/lib/utils';
import { SourceField, SourceStatusLine, sourceInputClass } from './source-form-parts';
import { useSourceFrameFooter } from './use-source-frame-footer';
import { RefreshButton } from './refresh-button';
import { NDPDatasetRow } from './ndp-dataset-row';
import { useNdpCatalog } from './use-ndp-catalog';
import { NDPOrganizationFilter } from './ndp-organization-filter';
import { NDPEndpointPanel } from './ndp-endpoint-panel';
import { InfoTip } from './info-tip';

type Selection = { dataset: NDPDataset; ids: string[] };
const datasetKey = (dataset: NDPDataset) => JSON.stringify([dataset.endpoint_id, dataset.id]);

/** Browse and select catalog metadata, then use the ordinary connected-source review. */
export function NDPSourcePicker(props: {
  workspaceId: string;
  provider: SourceProvider;
  onConnected: (sources: ConnectedSourceState[]) => void;
  onBack?: () => void;
}) {
  const [view, setView] = useState<'datasets' | 'endpoints'>('datasets');
  const [visitedEndpoints, setVisitedEndpoints] = useState(false);
  return (
    <div className="flex flex-col gap-[13px]">
      <SourceField
        label="Browse"
        hint={
          <span className="inline-flex items-center gap-1">
            {view === 'datasets'
              ? 'Discover scientific datasets in the NDP catalog.'
              : 'Browse catalogs, query services and explore streams.'}
            {view === 'datasets' ? (
              <InfoTip label="About datasets">
                Discover scientific observations, measurements, simulations and analysis results. A
                dataset can provide files in HDF5, NetCDF, CSV or other formats, plus metadata and
                links to live data.
              </InfoTip>
            ) : (
              <InfoTip label="About endpoints and streams">
                Connect to a research institution’s data services. Browse its catalog, query
                services and work with available streams through a direct connection or SSH.
              </InfoTip>
            )}
          </span>
        }
      >
        <SegmentedControl
          label="NDP view"
          className="self-start"
          value={view}
          onValueChange={(next) => {
            if (next === 'endpoints') setVisitedEndpoints(true);
            setView(next);
          }}
          options={[
            { value: 'datasets', label: 'Datasets' },
            { value: 'endpoints', label: 'Endpoints & streams' },
          ]}
        />
      </SourceField>
      <div hidden={view !== 'datasets'}>
        <NDPCatalogPicker {...props} active={view === 'datasets'} />
      </div>
      {visitedEndpoints ? (
        <div hidden={view !== 'endpoints'}>
          <NDPEndpointPanel
            workspaceId={props.workspaceId}
            onBack={() => setView('datasets')}
            signedIn={props.provider.authenticated}
          />
        </div>
      ) : null}
      {view === 'endpoints' ? <NdpEndpointsFooter onBack={props.onBack} /> : null}
    </div>
  );
}

/** Endpoints act in place, so the frame keeps only Back. */
function NdpEndpointsFooter({ onBack }: { onBack?: () => void }) {
  return useSourceFrameFooter({
    start: onBack ? { label: 'Back', back: true, onClick: onBack } : undefined,
  });
}

function NDPCatalogPicker({
  workspaceId,
  provider,
  onConnected,
  onBack,
  active,
}: {
  workspaceId: string;
  provider: SourceProvider;
  onConnected: (sources: ConnectedSourceState[]) => void;
  onBack?: () => void;
  /** The catalog is the open view, so it owns the frame's footer. */
  active: boolean;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
  const scope = connectionScope(settings);
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [showSelected, setShowSelected] = useState(false);
  const [limit, setLimit] = useState({ query: '', count: 30 });
  const signedIn = provider.authenticated ?? false;
  const catalog = useNdpCatalog(signedIn, provider.account_name);
  const searchInput = useRef<HTMLInputElement>(null);
  const choices = Object.values(selected);
  const count = choices.reduce((sum, choice) => sum + choice.ids.length, 0);
  const datasets = showSelected ? choices.map((choice) => choice.dataset) : catalog.datasets;
  const pageSize = limit.query === catalog.query ? limit.count : 30;
  const visibleDatasets = datasets.slice(0, pageSize);
  const connect = useMutation({
    mutationFn: async () => {
      const sources: ConnectedSourceState[] = [];
      for (const { dataset, ids } of choices) {
        const connectSelection = () =>
          repository.attachNdp(workspaceId, {
            endpoint_id: dataset.endpoint_id,
            dataset_id: dataset.id,
            resource_ids: ids,
          });
        try {
          sources.push(await connectSelection());
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !error.message.includes('Search for this NDP dataset again')
          )
            throw error;
          // Re-observe cached IDs after a backend restart; never widen the selection.
          await repository.searchNdp({ query: dataset.name, endpoint_id: dataset.endpoint_id });
          sources.push(await connectSelection());
        }
      }
      return sources;
    },
    onSuccess: (sources) => {
      void client.invalidateQueries({ queryKey: ['connected-storage', scope] });
      onConnected(sources);
    },
  });
  const select = (dataset: NDPDataset, id: string, checked: boolean) => {
    setSelected((previous) => {
      const key = datasetKey(dataset);
      const ids = previous[key]?.ids ?? [];
      const nextIds = checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id);
      const next = { ...previous };
      if (nextIds.length) next[key] = { dataset, ids: nextIds };
      else delete next[key];
      return next;
    });
  };
  const footer = (
    <CatalogFooter
      count={count}
      pending={connect.isPending}
      onConnect={() => connect.mutate()}
      onBack={onBack}
    />
  );
  return (
    <section aria-label="National Data Platform" className="space-y-4">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          catalog.submit();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchInput}
            aria-label="Search NDP datasets"
            placeholder="Search names, descriptions or files…"
            className={cn(sourceInputClass, 'pl-9 pr-9')}
            value={catalog.query}
            onChange={(event) => {
              catalog.setQuery(event.target.value);
              setShowSelected(false);
            }}
          />
          {catalog.query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              className="absolute right-0 top-0 size-[30px]"
              onClick={() => {
                catalog.setQuery('');
                searchInput.current?.focus();
              }}
            >
              <CloseIcon />
            </Button>
          ) : null}
        </div>
        <RefreshButton
          type="button"
          variant="outline"
          size="icon"
          label="Refresh catalog"
          refreshing={catalog.results.isFetching}
          onRefresh={catalog.submit}
        >
          <span className="sr-only">Refresh catalog</span>
        </RefreshButton>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NDPOrganizationFilter
          account={catalog.account}
          cacheEnabled={catalog.cacheEnabled}
          value={catalog.organization}
          onChange={(choice) => {
            catalog.setOrganization(choice);
            setShowSelected(false);
          }}
        />
        <select
          aria-label="Catalog access filter"
          className="h-8 max-w-full rounded-md border bg-background px-2 text-sm"
          value={catalog.onlyGroups ? 'groups' : 'all'}
          onChange={(event) => {
            catalog.setOnlyGroups(event.target.value === 'groups');
            setShowSelected(false);
          }}
        >
          <option value="all">All catalog data</option>
          <option value="groups" disabled={!signedIn}>
            Only my groups
          </option>
        </select>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span role="status" aria-live="polite">
            {catalog.searching && !catalog.data
              ? 'Searching…'
              : `${visibleDatasets.length}${!showSelected && catalog.data?.total !== undefined && catalog.data.total > visibleDatasets.length ? ` of ${catalog.data.total.toLocaleString()}` : ''} dataset${visibleDatasets.length === 1 ? '' : 's'}`}
            {catalog.searching && catalog.data ? ' Refreshing…' : ''}
          </span>
          {count > 0 ? (
            <Button
              type="button"
              size="sm"
              variant={showSelected ? 'secondary' : 'ghost'}
              aria-pressed={showSelected}
              onClick={() => setShowSelected((value) => !value)}
            >
              Selected ({count})
            </Button>
          ) : null}
        </div>
      </div>
      {catalog.results.isPending && !catalog.data && !showSelected ? (
        <div aria-label="Loading datasets" role="status" className="space-y-5 py-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : null}
      {catalog.results.error ? (
        <p role="alert" className="text-sm text-destructive">
          {catalog.results.error.message}
        </p>
      ) : null}
      {catalog.results.error && catalog.data ? (
        <p className="text-xs text-muted-foreground">Showing saved results.</p>
      ) : null}
      {catalog.data?.warnings.map((warning) => (
        <p role="status" key={warning} className="text-sm text-muted-foreground">
          {warning}
        </p>
      ))}
      <div
        role="region"
        tabIndex={0}
        className="max-h-[32dvh] divide-y divide-border/60 overflow-y-auto overscroll-contain pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="NDP datasets"
      >
        {visibleDatasets.map((dataset) => (
          <NDPDatasetRow
            key={`${showSelected ? 'selected' : catalog.query.trim() ? 'search' : 'browse'}:${datasetKey(dataset)}`}
            dataset={dataset}
            defaultOpen={showSelected || Boolean(catalog.query.trim())}
            selected={selected[datasetKey(dataset)]?.ids ?? []}
            disabled={connect.isPending}
            onChange={(id, checked) => select(dataset, id, checked)}
          />
        ))}
      </div>
      {!datasets.length && !catalog.searching && !catalog.results.error ? (
        <p className="py-4 text-sm text-muted-foreground">
          {showSelected
            ? 'No resources selected.'
            : catalog.query
              ? 'No matching datasets. Try another name or file format.'
              : 'No datasets found.'}
        </p>
      ) : null}
      {!showSelected && (datasets.length > pageSize || catalog.results.hasNextPage) ? (
        <Button
          type="button"
          variant="ghost"
          disabled={catalog.results.isFetchingNextPage}
          onClick={() => {
            setLimit({ query: catalog.query, count: pageSize + 30 });
            if (datasets.length <= pageSize && catalog.results.hasNextPage) {
              void catalog.results.fetchNextPage();
            }
          }}
        >
          {catalog.results.isFetchingNextPage ? 'Loading datasets…' : 'Show more datasets'}
        </Button>
      ) : null}
      {count > 0 ? (
        <SourceStatusLine
          icon={<CheckIcon />}
          tone="ok"
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={connect.isPending}
              onClick={() => {
                setSelected({});
                setShowSelected(false);
              }}
            >
              Clear selection
            </Button>
          }
        >
          {count} resource{count === 1 ? '' : 's'} selected
        </SourceStatusLine>
      ) : null}
      {connect.error ? (
        <SourceStatusLine role="alert" tone="error" icon={<CircleAlertIcon />}>
          {connect.error.message}
        </SourceStatusLine>
      ) : null}
      {active ? footer : null}
    </section>
  );
}

function CatalogFooter({
  count,
  pending,
  onConnect,
  onBack,
}: {
  count: number;
  pending: boolean;
  onConnect: () => void;
  onBack?: () => void;
}) {
  return useSourceFrameFooter({
    confirm: { label: pending ? 'Connecting…' : 'Connect', disabled: !count || pending },
    onConfirm: onConnect,
    start: onBack ? { label: 'Back', back: true, onClick: onBack, disabled: pending } : undefined,
  });
}
