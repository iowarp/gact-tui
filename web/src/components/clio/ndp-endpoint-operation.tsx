import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { NDPEndpointConnection } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { NDPActionPicker } from './ndp-action-picker';
import { identifierInputProps } from '@/lib/identifier-input';
import { formatDateTime } from '@/lib/locale-format';
import { ph, plural, t } from '@lingui/core/macro';

/** Run observed operations with explicit bounded capture and visible remote side effects. */
export function NDPEndpointOperationView({
  workspaceId,
  endpoint,
}: {
  workspaceId: string;
  endpoint: NDPEndpointConnection;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [operationId, setOperationId] = useState('');
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [seconds, setSeconds] = useState(10);
  const [events, setEvents] = useState(100);
  const history = useQuery({
    queryKey: ['ndp-captures', connectionScope(settings), workspaceId, endpoint.id],
    queryFn: () => repository.ndpEndpointCaptures(workspaceId, endpoint.id),
  });
  const operation = endpoint.operations.find((row) => row.id === operationId);
  const request = useMutation({
    mutationFn: async () => {
      if (!operation) throw new Error('Choose an operation');
      const values = Object.fromEntries(
        Object.entries(parameters)
          .filter(([, value]) => value !== '')
          .map(([name, value]) => {
            const schema = operation.parameters.find((row) => row.name === name)?.schema;
            const variants = schema?.anyOf as Array<{ type?: string }> | undefined;
            const kind =
              schema?.type ?? variants?.find((row) => row.type && row.type !== 'null')?.type;
            return [
              name,
              kind === 'integer' || kind === 'number'
                ? Number(value)
                : kind === 'object' || kind === 'array'
                  ? JSON.parse(value)
                  : kind === 'boolean'
                    ? value === 'true'
                    : value,
            ];
          }),
      );
      return repository.requestNdpEndpoint(workspaceId, endpoint.id, {
        operation_id: operation.id,
        parameters: values,
        ...(body.trim() ? { body: JSON.parse(body) } : {}),
        max_seconds: seconds,
        max_events: events,
      });
    },
    onSuccess: () => {
      setConfirm(false);
      void history.refetch();
    },
  });
  return (
    <div className="space-y-3">
      <div>
        <p className="break-all text-xs text-muted-foreground">{endpoint.url}</p>
      </div>
      <NDPActionPicker
        operations={endpoint.operations}
        value={operationId}
        onChange={(id) => {
          setOperationId(id);
          setParameters({});
          setBody('');
          setConfirm(false);
          request.reset();
        }}
      />
      {operation ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!operation.read_only && !confirm) setConfirm(true);
            else request.mutate();
          }}
        >
          <h4 className="font-medium">{operation.summary}</h4>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {operation.description}
          </p>
          {operation.parameters
            .filter((row) => row.name && ['path', 'query', 'query-map'].includes(row.in ?? ''))
            .map((row) => (
              <div key={row.name} className="space-y-1">
                <Label htmlFor={`ndp-param-${row.name}`}>
                  {row.name}
                  {row.required ? ' *' : ''}
                </Label>
                <Input
                  id={`ndp-param-${row.name}`}
                  required={row.required}
                  value={parameters[row.name!] ?? ''}
                  placeholder={
                    row.schema?.default != null ? String(row.schema.default) : row.description
                  }
                  onChange={(event) =>
                    setParameters({ ...parameters, [row.name!]: event.target.value })
                  }
                />
              </div>
            ))}
          {operation.body_schema ? (
            <div className="space-y-1">
              <Label htmlFor="ndp-operation-body">{t`Request JSON`}</Label>
              <Textarea
                {...identifierInputProps}
                id="ndp-operation-body"
                required={operation.body_required}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={JSON.stringify(operation.body_schema, null, 2)}
                className="max-h-40 font-mono text-xs"
              />
            </div>
          ) : null}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">{t`Response limits`}</summary>
            <div className="mt-2 flex gap-3">
              <div className="space-y-1">
                <Label htmlFor="ndp-capture-seconds">{t`Capture seconds`}</Label>
                <Input
                  id="ndp-capture-seconds"
                  type="number"
                  min={1}
                  max={30}
                  value={seconds}
                  onChange={(event) => setSeconds(Number(event.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ndp-capture-events">{t`Max stream events`}</Label>
                <Input
                  id="ndp-capture-events"
                  type="number"
                  min={1}
                  max={1000}
                  value={events}
                  onChange={(event) => setEvents(Number(event.target.value))}
                />
              </div>
            </div>
          </details>
          {confirm ? (
            <p role="alert" className="text-sm">
              {t`Run ${ph({ method: operation.method })} ${ph({ path: operation.path })} on ${ph({ name: endpoint.name })}? This can change remote state.`}
            </p>
          ) : null}
          <Button disabled={request.isPending}>
            {request.isPending
              ? t`Receiving data…`
              : confirm
                ? t`Confirm operation`
                : operation.read_only
                  ? t`Run and save response`
                  : t`Review action`}
          </Button>
        </form>
      ) : null}
      {request.error || history.error ? (
        <p role="alert" className="text-sm text-destructive">
          {(request.error ?? history.error)?.message}
        </p>
      ) : null}
      {request.data ? (
        <div className="space-y-2" aria-label={t`Endpoint response`}>
          <p role="status" className="flex flex-wrap gap-x-3 text-sm">
            <span>{t`HTTP ${ph({ status: request.data.status_code })}`}</span>{' '}
            <span>{plural(request.data.bytes_received, { one: '# byte', other: '# bytes' })}</span>{' '}
            <span>
              {plural(request.data.events, { one: '# stream event', other: '# stream events' })}
            </span>{' '}
            <span>{request.data.stop_reason.replaceAll('_', ' ')}</span>
          </p>
          <pre className="max-h-52 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
            {request.data.preview}
          </pre>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>
              {request.data.source_artifact_id
                ? t`Saved in workspace Sources`
                : t`Response retained`}
            </span>{' '}
            <span>{request.data.sha256.slice(0, 12)}</span>
          </p>
          {request.data.workspace_path ? (
            <Link
              className="text-sm underline"
              to={`/workspaces/${encodeURIComponent(workspaceId)}/new`}
              state={{
                globalSearchResource: {
                  scope: connectionScope(settings),
                  request: { kind: 'workspace-file', path: request.data.workspace_path },
                },
              }}
            >
              {t`Open captured response`}
            </Link>
          ) : null}
          {request.data.materialization?.state === 'failed' ? (
            <p role="alert" className="text-xs text-destructive">
              {request.data.materialization.reason}
            </p>
          ) : null}
        </div>
      ) : null}
      {history.data?.captures.length ? (
        <details>
          <summary className="cursor-pointer text-sm">
            {t`Captured responses (${ph({ count: history.data.captures.length })})`}
          </summary>
          <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
            {history.data.captures
              .slice()
              .reverse()
              .map((row) => (
                <li key={row.id}>
                  {row.workspace_path ? (
                    <Link
                      className="underline"
                      to={`/workspaces/${encodeURIComponent(workspaceId)}/new`}
                      state={{
                        globalSearchResource: {
                          scope: connectionScope(settings),
                          request: { kind: 'workspace-file', path: row.workspace_path },
                        },
                      }}
                    >
                      {row.operation_id}
                    </Link>
                  ) : (
                    row.operation_id
                  )}{' '}
                  <span className="mx-2">
                    {plural(row.bytes_received, { one: '# byte', other: '# bytes' })}
                  </span>{' '}
                  {formatDateTime(row.completed_at)}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
