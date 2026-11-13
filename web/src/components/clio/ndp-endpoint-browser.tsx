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
  NDP_SECTION_COPY,
  listingParameters,
  recordName,
  records,
  type NDPRecord,
} from './ndp-endpoint-data';
import { NDPWorkflowForm, type NDPWorkflow } from './ndp-workflow-form';
import { NDPSdkStreamActions } from './ndp-sdk-stream-actions';
import { formatDateTime } from '@/lib/locale-format';
import { ph, plural, t } from '@lingui/core/macro';

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
  const copy = section ? NDP_SECTION_COPY[section.name] : undefined;
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
  const archivedUrlOperation = ['GET /stream/segment/url', 'GET /pull/url'].find(has); // i18n-ignore: NDP operation id
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
      ? t`Create organization`
      : tab === 'Services'
        ? t`Register service`
        : tab === 'Catalog'
          ? t`Create dataset`
          : has('SDK streaming_v2.open')
            ? t`Open stream reader`
            : has('POST /streams')
              ? t`Open stream view`
              : t`Start stream`;
  const sample = (row: NDPRecord) => {
    if (tab === 'Files')
      // i18n-ignore: NDP operation id
      action('GET /pull/file/{filename}', t`Sample archived data`, {
        filename: String(row.filename ?? row.name),
        max_msgs: 100,
      });
    else if (tab === 'Stations')
      action('POST /bridge/sessions', t`Start stream`, {}, { sncl_codes: [recordName(row)] }); // i18n-ignore: NDP operation id
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
          <div className="flex flex-wrap gap-1" aria-label={t`Endpoint data views`}>
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
                {NDP_SECTION_COPY[row.name].label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              aria-label={copy?.search}
              placeholder={copy?.placeholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPageSize(50);
              }}
            />
            {['Catalog', 'Organizations', 'Services'].includes(tab) ? (
              <select
                aria-label={t`Catalog scope`}
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={server}
                onChange={(event) => {
                  setServer(event.target.value);
                  setWorkflow(undefined);
                }}
              >
                <option value="local">{t`Local`}</option>
                <option value="global">{t`Global`}</option>
              </select>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={listing.isFetching}
              onClick={() => void listing.refetch()}
            >
              {t`Refresh`}
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
              {t`Archived files can be sampled or replayed; their measurements are not necessarily live.`}
            </p>
          ) : null}
          {['Files', 'Streams'].includes(tab) && archivedUrlOperation ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => action(archivedUrlOperation, t`Sample archived URL`, { max_msgs: 10 })}
            >
              {t`Sample CSV from URL`}
            </Button>
          ) : null}
          {listing.error ? (
            <div role="alert" className="space-y-1 text-sm text-destructive">
              <p>{listing.error.message}</p>
              {/401|403|denied|account|role/i.test(listing.error.message) ? (
                <p className="text-xs">
                  {endpoint.authentication === 'none'
                    ? t`If access requires your connected NDP account, choose Edit endpoint → Use my NDP sign-in.`
                    : t`Check this Endpoint’s required identity issuer and role.`}
                </p>
              ) : null}
            </div>
          ) : null}
          {listing.isPending ? (
            <div role="status" aria-label={copy?.loading} className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <>
              {!listing.error ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {copy?.count(rows.length)}
                  {listing.isFetching ? ` ${t`Updating…`}` : ''}
                </p>
              ) : null}
              {!rows.length && !listing.error ? (
                <p className="text-sm text-muted-foreground">
                  {query ? t`No matches. Try a shorter name.` : copy?.empty}
                </p>
              ) : null}
              <div
                className="max-h-72 overflow-y-auto overscroll-contain divide-y divide-border/50"
                aria-label={copy?.results}
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
                            {t`Opened ${ph({ time: formatDateTime(row.created_at) })}`}
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
                          {t`Browse data`}
                        </Button>
                      ) : null}
                      {(tab === 'Files' && has('GET /pull/file/{filename}')) ||
                      (tab === 'Stations' && has('POST /bridge/sessions')) ? (
                        <Button variant="outline" size="sm" onClick={() => sample(row)}>
                          {tab === 'Files'
                            ? t({ message: 'Sample', context: 'verb' })
                            : t`Start stream`}
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
                              action(
                                'GET /streams/{stream_id}/segment', // i18n-ignore: NDP operation id
                                t`Capture stream records`,
                                {
                                  stream_id: String(row.id),
                                  cursor: String(row.cursor),
                                  max_records: 100,
                                  seconds: 3,
                                },
                              )
                            }
                          >
                            {t`Capture records`}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              action(
                                row.state === 'stopped'
                                  ? 'POST /streams/{stream_id}/resume' // i18n-ignore: NDP operation id
                                  : 'DELETE /streams/{stream_id}', // i18n-ignore: NDP operation id
                                row.state === 'stopped'
                                  ? t`Resume stream view`
                                  : t`Stop stream view`,
                                { stream_id: String(row.id) },
                              )
                            }
                          >
                            {row.state === 'stopped' ? t`Resume` : t`Stop`}
                          </Button>
                        </div>
                      ) : tab === 'Streams' && has('DELETE /bridge/sessions/{session_id}') ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            action(
                              // i18n-ignore: NDP operation id
                              'DELETE /bridge/sessions/{session_id}',
                              t`Stop stream`,
                              {
                                session_id: String(row.session_id ?? row.id),
                                delete_stream: false,
                                delete_source_resource: false,
                              },
                            )
                          }
                        >
                          {t`Stop`}
                        </Button>
                      ) : tab === 'Streams' && has('POST /stop-stream') ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            action(
                              // i18n-ignore: NDP operation id
                              'POST /stop-stream',
                              t`Stop replay`,
                              { filename: String(row.filename ?? row.name) },
                            )
                          }
                        >
                          {t`Stop`}
                        </Button>
                      ) : null}
                    </div>
                    {records(row.resources).length ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          {isService(row)
                            ? t`Service details`
                            : plural(records(row.resources).length, {
                                one: '# resource',
                                other: '# resources',
                              })}
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
                                        ? 'SDK streaming_v2.open' // i18n-ignore: NDP operation id
                                        : 'POST /streams', // i18n-ignore: NDP operation id
                                      t`Read ${ph({ name: recordName(resource) })}`,
                                      has('SDK streaming_v2.open')
                                        ? { resource_id: String(resource.id), start: 'earliest' }
                                        : {},
                                      has('SDK streaming_v2.open')
                                        ? undefined
                                        : { resource_id: String(resource.id), start: 'earliest' },
                                    )
                                  }
                                >
                                  {t`Read stream`}
                                </Button>
                              ) : null}
                              {typeof resource.url === 'string' &&
                              /^https?:\/\//i.test(resource.url) ? (
                                <ExternalLink href={resource.url} className="underline">
                                  {t`Open original`}
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
                            'GET /services/redirect/{service_identifier}/{path}', // i18n-ignore: NDP operation id
                            t`Query ${ph({ name: recordName(row) })}`,
                            { service_identifier: String(row.name ?? row.id), path: 'query' },
                            undefined,
                            /fdsn.*station/i.test(JSON.stringify(row)),
                          )
                        }
                      >
                        {t`Query service`}
                      </Button>
                    ) : null}
                  </div>
                ))}
                {rows.length > pageSize ? (
                  <Button variant="ghost" onClick={() => setPageSize(pageSize + 50)}>
                    {t`Show more`}
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t`This API does not advertise a supported catalog or stream view. Its available requests are under Advanced.`}
        </p>
      )}
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {t`Advanced API tools`}
        </summary>
        <div className="mt-3">
          <NDPEndpointOperationView workspaceId={workspaceId} endpoint={endpoint} />
        </div>
      </details>
    </div>
  );
}
