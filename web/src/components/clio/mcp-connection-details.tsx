import type { McpServerDefinition } from '@clio/core/v3';

/** Inspect the connection separately from the service inventory, without exposing process secrets. */
export function McpConnectionDetails({
  server,
}: {
  server: Pick<McpServerDefinition, 'spec' | 'transport'>;
}) {
  const spec = server.spec;
  const fields = [
    ['Transport', server.transport],
    ['Address', spec.url],
    ['Executable', spec.command],
  ].filter((row): row is [string, string] => typeof row[1] === 'string' && Boolean(row[1]));
  const args = Array.isArray(spec.args)
    ? spec.args.filter((item): item is string => typeof item === 'string')
    : [];
  const environment =
    spec.env && typeof spec.env === 'object' && !Array.isArray(spec.env)
      ? Object.keys(spec.env)
      : [];
  return (
    <dl className="space-y-4 text-sm">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="font-medium">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
      {args.length ? (
        <div>
          <dt className="font-medium">Arguments</dt>
          <dd className="mt-1">
            <ol className="list-inside list-decimal space-y-1">
              {args.map((argument, index) => (
                <li key={index} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
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
