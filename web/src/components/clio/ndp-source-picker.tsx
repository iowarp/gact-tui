import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SourceProvider, WorkspaceReference } from '@clio/core/v3';
import { ArrowLeftIcon, ChevronDownIcon, DatabaseIcon, SearchIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { sourceBytes } from './connected-source-labels';
import { ConnectedAccountSignIn } from './connected-source-auth';

/** Dataset-oriented NDP selection; attaching grants read-only access without fetching bytes. */
export function NDPSourcePicker({
  workspaceId,
  provider,
  onSelect,
  onChanged,
  onBack,
}: {
  workspaceId: string;
  provider: SourceProvider;
  onSelect?: (reference: WorkspaceReference) => void;
  onChanged: () => void;
  onBack: () => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
  const scope = connectionScope(settings);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [onlyGroups, setOnlyGroups] = useState(false);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const signedIn = provider.authenticated ?? false;
  const results = useQuery({
    queryKey: ['ndp-catalog', scope, search, onlyGroups],
    queryFn: ({ signal }) =>
      repository.searchNdp({ query: search, only_groups: onlyGroups }, signal),
    retry: false,
  });
  const count = Object.values(selected).reduce((sum, rows) => sum + rows.length, 0);
  const attach = useMutation({
    mutationFn: async () => {
      const references: WorkspaceReference[] = [];
      for (const dataset of results.data?.datasets ?? []) {
        const ids = selected[JSON.stringify([dataset.endpoint_id, dataset.id])];
        if (!ids?.length) continue;
        const source = await repository.attachNdp(workspaceId, {
          endpoint_id: dataset.endpoint_id,
          dataset_id: dataset.id,
          resource_ids: ids,
        });
        if (onSelect) {
          const lease = await repository.beginSourceDraft(workspaceId, source.id);
          const resource = await repository.attachSourceFolder(
            workspaceId,
            source.id,
            true,
            '',
            lease.id,
          );
          references.push({
            kind: 'resource',
            id: resource.id,
            label: source.label,
            detail: `${ids.length} NDP resource${ids.length === 1 ? '' : 's'}`,
            media_type: resource.detected_mime,
            revision: String(resource.revision),
            navigation: {
              resource_id: resource.id,
              source_id: source.id,
              source_draft_id: lease.id,
              source_provider: 'ndp',
              source_kind: 'folder',
              source_linked: 'true',
              source_path: '',
            },
          });
        }
      }
      return references;
    },
    onSuccess: (references) => {
      for (const reference of references) onSelect?.(reference);
      void client.invalidateQueries({ queryKey: ['connected-storage', scope] });
      onChanged();
      onBack();
    },
  });
  return (
    <section aria-label="National Data Platform" className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeftIcon /> Back
      </Button>
      <div className="flex items-center gap-3">
        <DatabaseIcon className="size-5 text-primary" />
        <div>
          <h3 className="font-medium">National Data Platform</h3>
          <p className="text-sm text-muted-foreground">Choose datasets and resources</p>
        </div>
      </div>
      {!signedIn ? (
        <ConnectedAccountSignIn
          provider="ndp"
          onComplete={() => {
            void client.invalidateQueries({ queryKey: ['connected-storage', scope] });
            void client.invalidateQueries({ queryKey: ['ndp-catalog', scope] });
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Signed in{provider.account_name ? ` as ${provider.account_name}` : ''}
        </p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSelected({});
          setSearch(query.trim());
          if (search === query.trim()) void results.refetch();
        }}
      >
        <Input
          aria-label="Search NDP datasets"
          placeholder="Search datasets…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit" variant="outline" aria-label="Search datasets">
          <SearchIcon />
        </Button>
      </form>
      <select
        aria-label="Endpoint filter"
        className="rounded-md border bg-background px-3 py-2 text-sm"
        value={onlyGroups ? 'groups' : 'all'}
        onChange={(event) => {
          setOnlyGroups(event.target.value === 'groups');
          setSelected({});
        }}
      >
        <option value="all">All endpoints</option>
        <option value="groups">Only my groups</option>
      </select>
      {results.isPending ? (
        <p role="status" className="animate-pulse text-sm text-muted-foreground">
          Searching NDP catalogs…
        </p>
      ) : null}
      {results.error ? (
        <p role="alert" className="text-sm text-destructive">
          {results.error.message}
        </p>
      ) : null}
      {results.data?.warnings.map((warning) => (
        <p role="status" key={warning} className="text-sm text-muted-foreground">
          {warning}
        </p>
      ))}
      <div className="divide-y divide-border/60">
        {results.data?.datasets.map((dataset) => {
          const key = JSON.stringify([dataset.endpoint_id, dataset.id]);
          const values = selected[key] ?? [];
          return (
            <Collapsible key={key} className="py-3">
              <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 text-left">
                <span className="min-w-0">
                  <span className="font-medium">{dataset.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {dataset.endpoint_name} · {dataset.resources.length} resources ·{' '}
                    {[
                      ...new Set(dataset.resources.map((item) => item.format).filter(Boolean)),
                    ].join(', ') || 'Format unspecified'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {dataset.access ? (
                    <Badge variant="outline">
                      {dataset.access === 'viewer' ? 'Viewer' : 'Request access'}
                    </Badge>
                  ) : null}
                  <ChevronDownIcon className="size-4" />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-3">
                {dataset.description ? (
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {dataset.description}
                  </p>
                ) : null}
                {dataset.resources.map((resource) => (
                  <label
                    key={resource.id}
                    className="flex cursor-pointer items-center gap-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={values.includes(resource.id)}
                      disabled={attach.isPending}
                      onCheckedChange={(checked) =>
                        setSelected((previous) => ({
                          ...previous,
                          [key]: checked
                            ? [...values, resource.id]
                            : values.filter((id) => id !== resource.id),
                        }))
                      }
                    />
                    <span className="min-w-0 flex-1 break-words">{resource.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {resource.format}
                      {resource.size ? ` · ${sourceBytes(resource.size)}` : ' · Size unknown'}
                    </span>
                  </label>
                ))}
                {!dataset.resources.length ? (
                  <p className="text-sm text-muted-foreground">No resources in this dataset.</p>
                ) : null}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
      {results.isSuccess && !results.data.datasets.length ? (
        <p className="text-sm text-muted-foreground">No datasets found.</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="max-w-sm text-xs text-muted-foreground">
          Read-only. Nothing is downloaded until the agent reads a selected resource.
        </p>
        <Button disabled={!count || attach.isPending} onClick={() => attach.mutate()}>
          {attach.isPending ? 'Attaching…' : `Attach ${count} resource${count === 1 ? '' : 's'}`}
        </Button>
      </div>
      {attach.error ? (
        <p role="alert" className="text-sm text-destructive">
          {attach.error.message}
        </p>
      ) : null}
    </section>
  );
}
