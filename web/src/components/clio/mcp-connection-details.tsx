import type { McpServerDefinition } from '@clio/core/v3';

/** Inspect the connection separately from the service inventory, without exposing process secrets. */
export function McpConnectionDetails({
  server,
}: {
  server: Pick<McpServerDefinition, 'spec' | 'transport'>;
}) {
  const spec = server.spec;
  const fields = [
    ['Transport', server.transport, false],
    ['Address', spec.url, true],
    ['Executable', spec.command, true],
  ].filter(
    (row): row is [string, string, boolean] => typeof row[1] === 'string' && Boolean(row[1]),
  );
  const args = Array.isArray(spec.args)
    ? spec.args.filter((item): item is string => typeof item === 'string')
    : [];
  const environment =
    spec.env && typeof spec.env === 'object' && !Array.isArray(spec.env)
      ? Object.keys(spec.env)
      : [];
  return (
    <dl className="space-y-4 text-sm">
      {fields.map(([label, value, mono]) => (
        <div className="min-w-0" key={label}>
          <dt className="font-medium">{label}</dt>
          <dd
            className={mono ? 'mt-1 truncate font-mono text-[0.75rem]' : 'mt-1'}
            title={mono ? value : undefined}
          >
            {value}
          </dd>
        </div>
      ))}
      {args.length ? (
        <div className="min-w-0">
          <dt className="font-medium">Arguments</dt>
          <dd className="mt-1 min-w-0">
            <ol className="list-inside list-decimal space-y-1">
              {args.map((argument, index) => (
                <li key={index} className="truncate font-mono text-[0.75rem]" title={argument}>
                  {argument}
                </li>
              ))}
            </ol>
          </dd>
        </div>
      ) : null}
      {environment.length ? (
        <div>
          <dt className="font-medium">Process settings</dt>
          <dd className="mt-1 [overflow-wrap:anywhere]">
            {environment.join(', ')}. Values are hidden.
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
