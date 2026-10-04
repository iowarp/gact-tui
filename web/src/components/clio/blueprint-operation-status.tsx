import { blueprintOperationPending, type BlueprintOperation } from '@clio/core/v3';
const labels: Record<string, string> = {
  waiting_for_turns: 'Reload queued until running turns finish',
  preparing: 'Validating the revision and preparing its MCP services',
  applying: 'Applying the prepared revision',
  applied: 'Revision applied',
  failed: 'Reload failed',
  interrupted: 'Reload outcome needs inspection',
  partial: 'Some blueprints were retained',
  unknown: 'Reload outcome unavailable',
};

/** Retain the outcome, exact checksums, and per-blueprint checks after navigation. */
export function BlueprintOperationStatus({ operation }: { operation?: BlueprintOperation }) {
  if (!operation) return null;
  const pending = blueprintOperationPending(operation);
  return (
    <div className="min-w-0 text-xs" role={operation.error ? 'alert' : 'status'}>
      <p className={operation.error ? 'text-destructive' : 'text-muted-foreground'}>
        {labels[operation.status] ?? operation.status}
      </p>
      {operation.error ? (
        <p className="mt-1 break-words text-destructive">{operation.error}</p>
      ) : null}
      {!pending ? (
        <details className="mt-1 text-muted-foreground">
          <summary className="cursor-pointer">Inspect Reload receipt</summary>
          <div className="mt-2 space-y-2 rounded-md border p-2">
            <p>
              Operation <span className="font-mono break-all">{operation.id}</span>
            </p>
            {operation.finished_at ? (
              <p>{new Date(operation.finished_at).toLocaleString()}</p>
            ) : null}
            {operation.installed.map((row) => (
              <div key={row.identity || row.id}>
                <p className="font-medium text-foreground">
                  {row.id} · {row.version}
                </p>
                <p className="break-all font-mono">{row.checksum}</p>
                {row.runtime_checks.map((check) => (
                  <p key={`${check.namespace}:${check.workspace ?? ''}`}>
                    {check.namespace}:{' '}
                    {check.status === 'ready'
                      ? `${check.tool_count ?? 0} ${check.tool_count === 1 ? 'tool' : 'tools'} verified`
                      : check.status.replaceAll('_', ' ')}
                    {check.workspace ? (
                      <span className="block break-all font-mono">{check.workspace}</span>
                    ) : null}
                  </p>
                ))}
              </div>
            ))}
            {operation.skipped.map((row) => (
              <p key={row.id}>
                {row.id}: {row.reason?.replaceAll('_', ' ') || 'retained'}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
