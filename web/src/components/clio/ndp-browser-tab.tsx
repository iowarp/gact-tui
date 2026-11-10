import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NDPDataset } from '@clio/core/v3';
import { DatabaseIcon, SearchIcon, UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { AddIcon, RefreshIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { FileTypeIcon } from './file-type-icon';
import { NDPOrganizationFilter } from './ndp-organization-filter';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { sourceInputClass } from './source-form-parts';
import { useNdpCatalog } from './use-ndp-catalog';
import { WindowedFileTree, type FileTreeRow } from './workbench-file-tree';

const datasetKey = (dataset: NDPDataset) => JSON.stringify([dataset.endpoint_id, dataset.id]);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

type Picked = { dataset: NDPDataset; resourceId: string };

/**
 * The NDP catalog as a workbench tab: the frame bar, a search and access row,
 * then one Files tree of organizations, datasets and their resources. A
 * resource is picked in the tree and added to the workspace from the bar, the
 * same connection the Connect dialog makes.
 */
export function NdpBrowserTab({ workspaceId, label }: { workspaceId: string; label: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
  const scope = connectionScope(settings);
  const providers = useQuery({
    queryKey: ['connected-storage', scope, 'accounts'],
    queryFn: ({ signal }) => repository.storageProviders(signal),
    retry: false,
  });
  const ndp = providers.data?.providers.find((provider) => provider.id === 'ndp');
  const signedIn = ndp?.authenticated ?? false;
  const catalog = useNdpCatalog(signedIn, ndp?.account_name);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [picked, setPicked] = useState<Picked>();
  const groups = useMemo(() => {
    const byOrganization = new Map<string, NDPDataset[]>();
    for (const dataset of catalog.datasets) {
      const name = dataset.organization || dataset.endpoint_name || 'Other';
      byOrganization.set(name, [...(byOrganization.get(name) ?? []), dataset]);
    }
    return [...byOrganization];
  }, [catalog.datasets]);
  const searching = Boolean(catalog.query.trim());
  // The first organization (and, while searching, every one) starts open.
  const isOpen = (path: string, index: number) =>
    path.startsWith('o:')
      ? !collapsed.has(path) && (index === 0 || searching || expanded.has(path))
      : expanded.has(path);
  const result: FileTreeRow[] = [];
  groups.forEach(([organization, datasets], index) => {
    const orgPath = `o:${organization}`;
    const orgOpen = isOpen(orgPath, index);
    result.push({
      kind: 'dir',
      path: orgPath,
      name: organization,
      depth: 0,
      open: orgOpen,
      icon: <UsersIcon className="size-3.5" />,
      meta: plural(datasets.length, 'dataset'),
    });
    if (!orgOpen) return;
    for (const dataset of datasets) {
      const path = `d:${datasetKey(dataset)}`;
      const open = isOpen(path, -1);
      result.push({
        kind: 'dir',
        path,
        name: dataset.title || dataset.name,
        depth: 1,
        open,
        icon: <DatabaseIcon className="size-3.5" />,
        meta: plural(dataset.resources.length, 'resource'),
      });
      if (!open) continue;
      for (const resource of dataset.resources)
        result.push({
          kind: 'file',
          path: `r:${datasetKey(dataset)}:${resource.id}`,
          name: resource.name,
          depth: 2,
          alignWithFolders: true,
          icon: <FileTypeIcon className="size-3.5" name={resource.name} />,
          size: resource.size || undefined,
        });
      if (!dataset.resources.length)
        result.push({
          kind: 'note',
          key: `${path}#empty`,
          depth: 2,
          label: 'No resources in this dataset',
        });
    }
  });
  const rows = result;
  const toggle = (path: string) => {
    const index = groups.findIndex(([organization]) => `o:${organization}` === path);
    const open = isOpen(path, index);
    if (path.startsWith('o:')) {
      setCollapsed((current) => {
        const next = new Set(current);
        if (open) next.add(path);
        else next.delete(path);
        return next;
      });
    }
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const select = (path: string) => {
    for (const dataset of catalog.datasets) {
      const prefix = `r:${datasetKey(dataset)}:`;
      if (path.startsWith(prefix)) {
        setPicked({ dataset, resourceId: path.slice(prefix.length) });
        add.reset();
        return;
      }
    }
  };
  const add = useMutation({
    mutationFn: (choice: Picked) =>
      repository.attachNdp(workspaceId, {
        endpoint_id: choice.dataset.endpoint_id,
        dataset_id: choice.dataset.id,
        resource_ids: [choice.resourceId],
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['connected-storage', scope] }),
  });
  const pickedResource = picked?.dataset.resources.find((row) => row.id === picked.resourceId);
  const selectedPath = picked ? `r:${datasetKey(picked.dataset)}:${picked.resourceId}` : undefined;
  const total = catalog.data?.total;
  const count =
    catalog.searching && !catalog.data
      ? 'Searching…'
      : total !== undefined && total > catalog.datasets.length && !searching
        ? `${plural(total, 'dataset')}`
        : plural(catalog.datasets.length, 'dataset');

  let body;
  if (catalog.results.isPending && !catalog.data)
    body = <StateView className="p-6" kind="loading" size="panel" title="Loading the catalog" />;
  else if (catalog.results.error && !catalog.data)
    body = (
      <StateView
        action={{ label: 'Retry', onClick: catalog.submit, icon: <RetryIcon /> }}
        className="p-6"
        detail={catalog.results.error.message}
        kind="error"
        size="panel"
        title="The NDP catalog could not be loaded"
      />
    );
  else if (!rows.length)
    body = (
      <StateView
        action={
          searching ? { label: 'Clear search', onClick: () => catalog.setQuery('') } : undefined
        }
        className="p-6"
        kind="empty"
        size="panel"
        title={searching ? 'No datasets match' : 'No datasets found'}
      />
    );
  else
    body = (
      <div className="px-1.5 pb-2" aria-label="NDP catalog">
        <WindowedFileTree
          onSelect={select}
          onToggle={toggle}
          rows={rows}
          selectedPath={selectedPath}
        />
        {catalog.results.hasNextPage ? (
          <Button
            className="mt-1 ml-2 h-6 px-2 text-xs"
            disabled={catalog.results.isFetchingNextPage}
            onClick={() => void catalog.results.fetchNextPage()}
            size="sm"
            variant="ghost"
          >
            {catalog.results.isFetchingNextPage ? 'Loading datasets…' : 'Show more datasets'}
          </Button>
        ) : null}
      </div>
    );

  return (
    <section aria-label="NDP browser" className="flex h-full min-h-0 flex-col">
      <FrameBar
        actions={
          <>
            <IconButton
              disabled={catalog.results.isFetching}
              icon={<RefreshIcon />}
              label="Refresh catalog"
              onClick={catalog.submit}
              size="sm"
              tooltipSide="bottom"
            />
            <Button
              className="h-[26px] gap-1.5 px-2 text-[12px]"
              disabled={!picked || add.isPending || add.isSuccess}
              onClick={() => picked && add.mutate(picked)}
              size="sm"
              title={
                pickedResource
                  ? `Add ${pickedResource.name} to this workspace`
                  : 'Pick a resource in the tree first'
              }
              variant="outline"
            >
              <AddIcon aria-hidden="true" className="size-3.5" />
              {add.isPending ? 'Adding…' : add.isSuccess ? 'Added' : 'Add to workspace'}
            </Button>
          </>
        }
        label="NDP actions"
        what={
          <span data-frame-position="" role="status" aria-live="polite">
            {count}
          </span>
        }
        where={<FrameCrumbs parts={[{ label: 'NDP' }, { label }]} />}
      />
      <form
        className="flex shrink-0 flex-wrap items-center gap-2 px-3.5 pt-2.5 pb-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          catalog.submit();
        }}
      >
        <div className="relative min-w-[8rem] flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search NDP datasets"
            className={cn(sourceInputClass, 'pl-8')}
            onChange={(event) => catalog.setQuery(event.target.value)}
            placeholder="Search datasets"
            value={catalog.query}
          />
        </div>
        <select
          aria-label="Catalog access filter"
          className={cn(sourceInputClass, 'w-auto max-w-full basis-[30%] border bg-background')}
          onChange={(event) => catalog.setOnlyGroups(event.target.value === 'groups')}
          value={catalog.onlyGroups ? 'groups' : 'all'}
        >
          <option value="all">All catalog data</option>
          <option disabled={!signedIn} value="groups">
            Only my groups
          </option>
        </select>
        <NDPOrganizationFilter
          account={catalog.account}
          cacheEnabled={catalog.cacheEnabled}
          onChange={catalog.setOrganization}
          value={catalog.organization}
        />
      </form>
      {add.error ? (
        <p className="px-3.5 pb-1 text-[12px] text-destructive" role="alert">
          {add.error.message}
        </p>
      ) : add.isSuccess && pickedResource ? (
        <p className="px-3.5 pb-1 text-[12px] text-muted-foreground" role="status">
          {pickedResource.name} is in this workspace's Sources.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </section>
  );
}
