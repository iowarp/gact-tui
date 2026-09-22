import type { ProviderHandshake, ProviderModelRefreshResult } from '@clio/core/v3';
import { ClioStatus } from './status';

function readableState(value: string): string {
  return value.replaceAll('_', ' ');
}

function readableTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? 'at an unavailable time'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        timestamp,
      );
}

export function HandshakeResult({ result }: { result: ProviderHandshake }) {
  const healthy =
    result.connectivity === 'ok' && ['ok', 'not_required', 'deferred'].includes(result.auth);
  return (
    <div className="grid gap-1 text-sm">
      <ClioStatus
        label={healthy ? 'Provider ready' : 'Provider needs attention'}
        value={healthy ? 'healthy' : 'degraded'}
      />
      <p className="text-muted-foreground">
        {result.error ??
          `Connection ${readableState(result.connectivity)}, sign-in ${readableState(result.auth)}, ${result.models.length} model${result.models.length === 1 ? '' : 's'}`}
      </p>
      <p className="text-xs text-muted-foreground" title={`Reported source: ${result.source}`}>
        {result.latency_ms === undefined
          ? `Checked ${readableTimestamp(result.generated_at)} by the connected agent.`
          : `Checked ${readableTimestamp(result.generated_at)} in ${Math.round(result.latency_ms)} ms.`}
      </p>
    </div>
  );
}

export function RefreshResult({ result }: { result: ProviderModelRefreshResult }) {
  return (
    <div className="grid gap-1 text-sm">
      <ClioStatus
        label={result.failed_reason ? 'Catalog check failed' : 'Catalog refreshed'}
        value={result.failed_reason ? 'degraded' : 'healthy'}
      />
      <p className="text-muted-foreground">
        {result.failed_reason ??
          `${result.discovered.length} available model${result.discovered.length === 1 ? '' : 's'}, ${result.added.length} added, ${result.removed.length} removed`}
      </p>
      <p className="text-xs text-muted-foreground" title={`Reported source: ${result.source}`}>
        Checked {readableTimestamp(result.generated_at)} by the connected agent.
      </p>
    </div>
  );
}
