import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NDPEndpointConnection,
  NDPEndpointOperation,
  NDPEndpointRequest,
} from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { concreteSchema, record, records, recordName, type NDPRecord } from './ndp-endpoint-data';
import { NDPCaptureResult } from './ndp-capture-result';
import { NDPQueryFields } from './ndp-query-fields';
import { NDPNestedFields } from './ndp-nested-fields';
import { NDPStationFilters } from './ndp-station-filters';

export type NDPWorkflow = {
  title: string;
  operation: NDPEndpointOperation;
  parameters?: NDPRecord;
  body?: NDPRecord;
  stationService?: boolean;
};
const labels: Record<string, string> = {
  sncl_codes: 'Station codes',
  owner_org: 'Organization',
  max_msgs: 'Rows to sample',
  filename: 'File',
  max_seconds: 'Sample duration (seconds)',
  interval: 'Seconds between records',
  service_identifier: 'Service',
  source_topic: 'Source topic',
  keep_source_resource: 'Keep source resource',
  target_dataset: 'Output dataset',
  dataset_name: 'Dataset name',
  session_id: 'Stream session',
  resource_id: 'Catalog resource',
  topic: 'Kafka topic',
  start: 'Start reading',
  max_records: 'Records to capture',
  seconds: 'Wait for records (seconds)',
  delete_stream: 'Delete stream data',
  delete_source_resource: 'Delete source resource',
};
const privateField = (name: string) =>
  /password|token|secret|authorization|api_key|username/i.test(name);
const primaryFields = new Set([
  'name',
  'title',
  'description',
  'sncl_codes',
  'max_msgs',
  'server',
  'url',
  'filename',
  'resource_id',
  'topic',
  'start',
  'max_records',
]);
const fieldType = (schema: NDPRecord): string =>
  String(
    schema.type ??
      (Array.isArray(schema.anyOf)
        ? record(schema.anyOf.find((item) => record(item).type !== 'null')).type
        : '') ??
      'string',
  );

/** Forms use discovered schemas but present the user's task rather than an HTTP console. */
export function NDPWorkflowForm({
  workspaceId,
  endpoint,
  workflow,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  endpoint: NDPEndpointConnection;
  workflow: NDPWorkflow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const { operation } = workflow;
  const archivedUrl = ['GET /stream/segment/url', 'GET /pull/url'].includes(operation.id);
  const kafkaSegment = ['GET /streams/{stream_id}/segment', 'SDK streaming_v2.read'].includes(
    operation.id,
  );
  const { settings } = useConnectionSettings();
  const sourceChoices = useQuery({
    queryKey: ['ndp-stream-sources', connectionScope(settings), workspaceId, endpoint.id],
    enabled:
      (operation.id === 'POST /streams' && !workflow.body?.resource_id) ||
      (operation.id === 'SDK streaming_v2.open' && !workflow.parameters?.resource_id),
    queryFn: ({ signal }) =>
      repository.browseNdpEndpoint(
        workspaceId,
        endpoint.id,
        {
          operation_id: 'GET /resources/search',
          parameters: { server: 'local', format: 'kafka', limit: 1000 },
        },
        signal,
      ),
    retry: false,
  });
  const [values, setValues] = useState<NDPRecord>({ ...workflow.parameters });
  const [body, setBody] = useState<NDPRecord>({ ...workflow.body });
  const [review, setReview] = useState(false);
  const [seconds, setSeconds] = useState(30);
  const [events, setEvents] = useState(100);
  const fields = [
    ...operation.parameters
      .filter((row) => row.name && ['query', 'path'].includes(row.in ?? ''))
      .map((row) => ({
        name: row.name!,
        schema: record(row.schema),
        required: row.required ?? false,
        body: false,
      })),
    ...Object.entries(record(operation.body_schema?.properties)).map(([name, schema]) => ({
      name,
      schema: record(schema),
      required: (operation.body_schema?.required as string[] | undefined)?.includes(name) ?? false,
      body: true,
    })),
  ].filter(
    (row) =>
      !privateField(row.name) &&
      !(
        !row.body &&
        [
          'server',
          'service_identifier',
          'path',
          'session_id',
          'stream_id',
          ...(kafkaSegment ? ['cursor'] : []),
        ].includes(row.name) &&
        workflow.parameters?.[row.name] !== undefined
      ) &&
      !(
        ['POST /streams', 'SDK streaming_v2.open'].includes(operation.id) &&
        row.name === 'resource_id' &&
        (workflow.body?.resource_id || workflow.parameters?.resource_id)
      ),
  );
  const request = useMutation({
    mutationFn: () =>
      repository.requestNdpEndpoint(workspaceId, endpoint.id, {
        operation_id: operation.id,
        parameters: values,
        ...(operation.body_schema ? { body } : {}),
        max_seconds: seconds,
        max_events: events,
      } satisfies NDPEndpointRequest),
    onSuccess: (capture) => {
      const continuation = capture.continuation;
      if (kafkaSegment && continuation && continuation.stream_id === values.stream_id) {
        const nextCursor = continuation.next_cursor;
        setValues((current) => ({ ...current, cursor: nextCursor }));
      }
      setReview(false);
      onSaved();
      void client.invalidateQueries({ queryKey: ['ndp-captures'] });
    },
  });
  const input = (field: (typeof fields)[number]) => {
    const current = field.body ? body : values;
    const change = (value: unknown) => {
      const next = { ...current, [field.name]: value };
      if (value === '') delete next[field.name];
      (field.body ? setBody : setValues)(next);
      setReview(false);
    };
    const value = current[field.name];
    const kind = fieldType(field.schema);
    const title =
      archivedUrl && field.name === 'url'
        ? 'CSV URL'
        : archivedUrl && field.name === 'cursor'
          ? 'Resume cursor'
          : (labels[field.name] ?? String(field.schema.title ?? field.name.replaceAll('_', ' ')));
    return (
      <div key={`${field.body}/${field.name}`} className="space-y-1">
        <Label htmlFor={`ndp-workflow-${field.name}`}>
          {title}
          {field.required ? ' *' : ''}
        </Label>
        {['POST /streams', 'SDK streaming_v2.open'].includes(operation.id) &&
        field.name === 'resource_id' ? (
          <>
            <select
              id={`ndp-workflow-${field.name}`}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={String(value ?? '')}
              onChange={(event) => change(event.target.value)}
            >
              <option value="">Choose a cataloged stream</option>
              {records(sourceChoices.data).map((source) => (
                <option key={String(source.id)} value={String(source.id)}>
                  {recordName(source)}
                </option>
              ))}
            </select>
            {sourceChoices.error ? <p role="alert">{String(sourceChoices.error)}</p> : null}
          </>
        ) : kind === 'object' ||
          (kind === 'array' &&
            concreteSchema(record(concreteSchema(field.schema).items)).type === 'object') ? (
          <NDPNestedFields
            schema={field.schema}
            value={value}
            onChange={change}
            prefix={`ndp-workflow-${field.name}`}
          />
        ) : Array.isArray(field.schema.enum) || kind === 'boolean' ? (
          <select
            id={`ndp-workflow-${field.name}`}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={String(value ?? field.schema.default ?? '')}
            onChange={(event) =>
              change(
                event.target.value === ''
                  ? ''
                  : kind === 'boolean'
                    ? event.target.value === 'true'
                    : event.target.value,
              )
            }
          >
            <option value="">Default</option>
            {(kind === 'boolean' ? [true, false] : (field.schema.enum as unknown[])).map(
              (option) => (
                <option key={String(option)} value={String(option)}>
                  {['POST /streams', 'SDK streaming_v2.open'].includes(operation.id) &&
                  field.name === 'start'
                    ? option === 'earliest'
                      ? 'Retained history'
                      : 'New arrivals'
                    : String(option)}
                </option>
              ),
            )}
          </select>
        ) : (
          <Input
            id={`ndp-workflow-${field.name}`}
            required={field.required}
            type={kind === 'number' || kind === 'integer' ? 'number' : 'text'}
            step={kind === 'number' ? 'any' : kind === 'integer' ? 1 : undefined}
            min={typeof field.schema.minimum === 'number' ? field.schema.minimum : undefined}
            max={typeof field.schema.maximum === 'number' ? field.schema.maximum : undefined}
            value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
            placeholder={String(
              field.schema.default ?? (kind === 'array' ? 'Separate values with commas' : ''),
            )}
            onChange={(event) => {
              const text = event.target.value;
              if (!text) {
                const next = { ...current };
                delete next[field.name];
                (field.body ? setBody : setValues)(next);
                setReview(false);
              } else
                change(
                  kind === 'array'
                    ? text
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean)
                    : kind === 'integer' || kind === 'number'
                      ? Number(text)
                      : text,
                );
            }}
          />
        )}
      </div>
    );
  };
  return (
    <form
      className="space-y-3 border-t pt-3"
      aria-label={workflow.title}
      onSubmit={(event) => {
        event.preventDefault();
        if (!operation.read_only && !review) setReview(true);
        else request.mutate();
      }}
    >
      <h4 className="font-medium">{workflow.title}</h4>
      {operation.id === 'GET /stream/segment/url' ? (
        <p className="text-xs text-muted-foreground">
          Save a finite segment, then use its completion cursor under Options to continue from the
          next record. Between requests the read connection is closed; no remote producer is paused.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.filter((field) => field.required || primaryFields.has(field.name)).map(input)}
      </div>
      {operation.parameters.some((field) => field.in === 'query-map') ? (
        workflow.stationService ? (
          <NDPStationFilters
            value={record(values.query)}
            onChange={(query) => {
              setValues((previous) => ({ ...previous, query }));
              setReview(false);
            }}
          />
        ) : (
          <NDPQueryFields
            onChange={(query) => {
              setValues((previous) => ({ ...previous, query }));
              setReview(false);
            }}
          />
        )
      ) : null}
      {fields.some((field) => !field.required && !primaryFields.has(field.name)) ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Options</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {fields.filter((field) => !field.required && !primaryFields.has(field.name)).map(input)}
          </div>
        </details>
      ) : null}
      {operation.read_only ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Sample limits</summary>
          <div className="mt-2 flex gap-3">
            <Label>
              Seconds
              <Input
                type="number"
                min={1}
                max={30}
                value={seconds}
                onChange={(event) => setSeconds(Number(event.target.value))}
              />
            </Label>
            <Label>
              Events
              <Input
                type="number"
                min={1}
                max={1000}
                value={events}
                onChange={(event) => setEvents(Number(event.target.value))}
              />
            </Label>
          </div>
        </details>
      ) : null}
      {review ? (
        <div role="alert" className="space-y-1 text-sm">
          <p>
            {workflow.title} on <strong>{endpoint.name}</strong>?
          </p>
          <div className="space-y-1 text-xs text-muted-foreground break-all">
            {Object.entries({ ...values, ...body }).map(([name, value]) => (
              <p key={name}>
                {labels[name] ?? name}: {Array.isArray(value) ? value.join(', ') : String(value)}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={request.isPending}>
          {request.isPending
            ? 'Working…'
            : review
              ? 'Confirm'
              : operation.read_only
                ? kafkaSegment
                  ? request.data?.continuation
                    ? 'Capture next records'
                    : 'Capture records'
                  : operation.method === 'SDK'
                    ? workflow.title
                    : 'Save sample'
                : 'Review'}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {request.error ? (
        <p role="alert" className="text-sm text-destructive">
          {request.error.message}
        </p>
      ) : null}
      {request.data ? <NDPCaptureResult capture={request.data} workspaceId={workspaceId} /> : null}
    </form>
  );
}
