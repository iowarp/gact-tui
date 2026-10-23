import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NDPEndpointConnection } from '@clio/core/v3';
import { AddIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from '@/components/ui/external-link';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { NDPEndpointOperationView } from './ndp-endpoint-operation';
import {
  endpointSections,
  isService,
  listingParameters,
  recordName,
  records,
  type NDPRecord,
} from './ndp-endpoint-data';
import { NDPWorkflowForm, type NDPWorkflow } from './ndp-workflow-form';
import { NDPSdkStreamActions } from './ndp-sdk-stream-actions';

/** Browse data domains first; the API console remains an optional diagnostic surface. */
export function NDPEndpointBrowser({
  workspaceId,
  endpoint,
}: {
  workspaceId: string;
  endpoint: NDPEndpointConnection;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sections = endpointSections(endpoint);
  const [tab, setTab] = useState(sections[0]?.name ?? '');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [server, setServer] = useState('local');
  const [workflow, setWorkflow] = useState<NDPWorkflow>();
  const [pageSize, setPageSize] = useState(50);
  const section = sections.find((row) => row.name === tab);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(timer);
  }, [query]);
  const listing = useQuery({
    queryKey: [
      'ndp-domain',
      connectionScope(settings),
      workspaceId,
      endpoint.id,
      endpoint.observed_at,
      section?.name,
      server,
      ['Catalog', 'Services', 'Files'].includes(tab) ? debounced : '',
    ],
    queryFn: ({ signal }) =>
      repository.browseNdpEndpoint(
        workspaceId,
        endpoint.id,
        {
          operation_id: section!.operation,
          parameters: listingParameters(section!, debounced, server),
        },
        signal,
      ),
    enabled: Boolean(section) && !workflow,
    retry: false,
    staleTime: 30_000,
  });
  const rows = records(listing.data).filter(
    (row) =>
      (tab !== 'Services' || isService(row)) &&
      query
        .toLocaleLowerCase()
        .split(/\s+/)
        .every((word) => JSON.stringify(row).toLocaleLowerCase().includes(word)),
  );
  const action = (
    id: string,
    title: string,
    parameters?: NDPRecord,
    body?: NDPRecord,
    stationService?: boolean,
  ) => {
    const operation = endpoint.operations.find((row) => row.id === id);
    if (operation) setWorkflow({ title, operation, parameters, body, stationService });
  };
  const has = (id: string) => endpoint.operations.some((row) => row.id === id);
  const archivedUrlOperation = ['GET /stream/segment/url', 'GET /pull/url'].find(has);
  const createId =
    tab === 'Organizations'
      ? 'POST /organization'
      : tab === 'Services'
        ? 'POST /services'
        : tab === 'Catalog'
          ? 'POST /dataset'
          : tab === 'Streams' || tab === 'Stations'
            ? tab === 'Streams' && has('SDK streaming_v2.open')
              ? 'SDK streaming_v2.open'
              : tab === 'Streams' && has('POST /streams')
                ? 'POST /streams'
                : 'POST /bridge/sessions'
            : '';
  const createTitle =
    tab === 'Organizations'
      ? 'Create organization'
      : tab === 'Services'
        ? 'Register service'
        : tab === 'Catalog'
          ? 'Create dataset'
          : has('SDK streaming_v2.open')
            ? 'Open stream reader'
            : has('POST /streams')
              ? 'Open stream view'
              : 'Start stream';
  const sample = (row: NDPRecord) => {
    if (tab === 'Files')
      action('GET /pull/file/{filename}', 'Sample archived data', {
        filename: String(row.filename ?? row.name),
        max_msgs: 100,
      });
    else if (tab === 'Stations')
      action('POST /bridge/sessions', 'Start stream', {}, { sncl_codes: [recordName(row)] });
  };
  if (workflow)
    return (
      <NDPWorkflowForm
        key={`${workflow.operation.id}/${JSON.stringify(workflow.parameters ?? {})}/${JSON.stringify(workflow.body ?? {})}`}
        workspaceId={workspaceId}
        endpoint={endpoint}
        workflow={workflow}
        onClose={() => setWorkflow(undefined)}
        onSaved={() => {
          if (
            !workflow.operation.read_only ||
            workflow.operation.id === 'GET /streams/{stream_id}/segment' ||
            workflow.operation.id.startsWith('SDK streaming_v2.')
          )
            void listing.refetch();
        }}
      />
    );
  return (
    <div className="space-y-3">
      {sections.length ? (
        <>
          <div className="flex flex-wrap gap-1" aria-label="Endpoint data views">
            {sections.map((row) => (
              <Button
                key={row.name}
                size="sm"
                variant={tab === row.name ? 'secondary' : 'ghost'}
                aria-pressed={tab === row.name}
                onClick={() => {
                  setTab(row.name);
                  setQuery('');
                  setDebounced('');
                  setWorkflow(undefined);
                  setPageSize(50);
                }}
              >
                {row.name}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              aria-label={`Search ${tab.toLowerCase()}`}
              placeholder={`Search ${tab.toLowerCase()}…`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPageSize(50);
              }}
            />
            {['Catalog', 'Organizations', 'Services'].includes(tab) ? (
              <select
                aria-label="Catalog scope"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={server}
                onChange={(event) => {
                  setServer(event.target.value);
                  setWorkflow(undefined);
                }}
              >
                <option value="local">Local</option>
                <option value="global">Global</option>
              </select>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={listing.isFetching}
              onClick={() => void listing.refetch()}
            >
              Refresh
            </Button>
            {has(createId) && server === 'local' ? (
              <Button
                size="icon"
                variant="outline"
                aria-label={createTitle}
                onClick={() =>
                  action(
                    createId,
                    createTitle,
                    tab === 'Organizations' ? { server: 'local' } : undefined,
                  )
                }
              >
                <AddIcon />
              </Button>
            ) : null}
          </div>
          {tab === 'Files' ? (
            <p className="text-xs text-muted-foreground">
              Archived files can be sampled or replayed; their measurements are not necessarily
              live.
            </p>
          ) : null}
          {['Files', 'Streams'].includes(tab) && archivedUrlOperation ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => action(archivedUrlOperation, 'Sample archived URL', { max_msgs: 10 })}
            >
              Sample CSV from URL
            </Button>
          ) : null}
          {listing.error ? (
            <div role="alert" className="space-y-1 text-sm text-destructive">
              <p>{listing.error.message}</p>
              {/401|403|denied|account|role/i.test(listing.error.message) ? (
                <p className="text-xs">
                  {endpoint.authentication === 'none'
                    ? 'If access requires your connected NDP account, choose Edit endpoint → Use my NDP sign-in.'
                    : 'Check this Endpoint’s required identity issuer and role.'}
                </p>
              ) : null}
            </div>
          ) : null}
          {listing.isPending ? (
            <div role="status" aria-label={`Loading ${tab.toLowerCase()}`} className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <>
              {!listing.error ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {rows.length.toLocaleString()}{' '}
                  {tab === 'Catalog'
                    ? rows.length === 1
                      ? 'dataset'
                      : 'datasets'
                    : tab.toLowerCase()}
                  {listing.isFetching ? ' Updating…' : ''}
                </p>
              ) : null}
              {!rows.length && !listing.error ? (
                <p className="text-sm text-muted-foreground">
                  {query
                    ? 'No matches. Try a shorter name.'
                    : `No ${tab.toLowerCase()} returned by this Endpoint.`}
                </p>
              ) : null}
              <div
                className="max-h-72 overflow-y-auto overscroll-contain divide-y divide-border/50"
                aria-label={`${tab} results`}
              >
                {rows.slice(0, pageSize).map((row, index) => (
                  <div key={`${String(row.id ?? row.name)}-${index}`} className="py-2 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{recordName(row)}</p>
                        {row.notes || row.description || row.status || row.state ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {String(row.notes ?? row.description ?? row.status ?? row.state)}
                          </p>
                        ) : null}
                        {tab === 'Streams' &&
                        typeof row.created_at === 'string' &&
                        Number.isFinite(Date.parse(row.created_at)) ? (
                          <time
                            dateTime={row.created_at}
                            className="block text-xs text-muted-foreground"
                          >
                            Opened {new Date(row.created_at).toLocaleString()}
                          </time>
                        ) : null}
                      </div>
                      {tab === 'Organizations' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setTab('Catalog');
                            setQuery(String(row.name));
                            setDebounced(String(row.name));
                          }}
                        >
                          Browse data
                        </Button>
                      ) : null}
                      {(tab === 'Files' && has('GET /pull/file/{filename}')) ||
                      (tab === 'Stations' && has('POST /bridge/sessions')) ? (
                        <Button variant="outline" size="sm" onClick={() => sample(row)}>
                          {tab === 'Files' ? 'Sample' : 'Start stream'}
                        </Button>
                      ) : null}
                      {tab === 'Streams' && has('SDK streaming_v2.read') ? (
                        <NDPSdkStreamActions row={row} action={action} />
                      ) : tab === 'Streams' && has('GET /streams/{stream_id}/segment') ? (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={row.state === 'stopped'}
                            onClick={() =>
                              action('GET /streams/{stream_id}/segment', 'Capture stream records', {
                                stream_id: String(row.id),
                                cursor: String(row.cursor),
                                max_records: 100,
                                seconds: 3,
                              })
                            }
                          >
                            Capture records
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              action(
                                row.state === 'stopped'
                                  ? 'POST /streams/{stream_id}/resume'
                                  : 'DELETE /streams/{stream_id}',
                                row.state === 'stopped' ? 'Resume stream view' : 'Stop stream view',
                                { stream_id: String(row.id) },
                              )
                            }
                          >
                            {row.state === 'stopped' ? 'Resume' : 'Stop'}
                          </Button>
                        </div>
                      ) : tab === 'Streams' && has('DELETE /bridge/sessions/{session_id}') ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            action('DELETE /bridge/sessions/{session_id}', 'Stop stream', {
                              session_id: String(row.session_id ?? row.id),
                              delete_stream: false,
                              delete_source_resource: false,
                            })
                          }
                        >
                          Stop
                        </Button>
                      ) : tab === 'Streams' && has('POST /stop-stream') ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            action('POST /stop-stream', 'Stop replay', {
                              filename: String(row.filename ?? row.name),
                            })
                          }
                        >
                          Stop
                        </Button>
                      ) : null}
                    </div>
                    {records(row.resources).length ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          {isService(row)
                            ? 'Service details'
                            : `${records(row.resources).length} resources`}
                        </summary>
                        <ul className="mt-2 space-y-2">
                          {records(row.resources).map((resource, ri) => (
                            <li
                              key={String(resource.id ?? ri)}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <span>{recordName(resource)}</span>
                              <span className="text-muted-foreground">
                                {String(resource.format ?? '')}
                              </span>
                              {String(resource.format).toLowerCase() === 'kafka' &&
                              (has('SDK streaming_v2.open') || has('POST /streams')) ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    action(
                                      has('SDK streaming_v2.open')
                                        ? 'SDK streaming_v2.open'
                                        : 'POST /streams',
                                      `Read ${recordName(resource)}`,
                                      has('SDK streaming_v2.open')
                                        ? { resource_id: String(resource.id), start: 'earliest' }
                                        : {},
                                      has('SDK streaming_v2.open')
                                        ? undefined
                                        : { resource_id: String(resource.id), start: 'earliest' },
                                    )
                                  }
                                >
                                  Read stream
                                </Button>
                              ) : null}
                              {typeof resource.url === 'string' &&
                              /^https?:\/\//i.test(resource.url) ? (
                                <ExternalLink href={resource.url} className="underline">
                                  Open original
                                </ExternalLink>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    {isService(row) && has('GET /services/redirect/{service_identifier}/{path}') ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          action(
                            'GET /services/redirect/{service_identifier}/{path}',
                            `Query ${recordName(row)}`,
                            { service_identifier: String(row.name ?? row.id), path: 'query' },
                            undefined,
                            /fdsn.*station/i.test(JSON.stringify(row)),
                          )
                        }
                      >
                        Query service
                      </Button>
                    ) : null}
                  </div>
                ))}
                {rows.length > pageSize ? (
                  <Button variant="ghost" onClick={() => setPageSize(pageSize + 50)}>
                    Show more
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          This API does not advertise a supported catalog or stream view. Its available requests are
          under Advanced.
        </p>
      )}
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Advanced API tools
        </summary>
        <div className="mt-3">
          <NDPEndpointOperationView workspaceId={workspaceId} endpoint={endpoint} />
        </div>
      </details>
    </div>
  );
}
