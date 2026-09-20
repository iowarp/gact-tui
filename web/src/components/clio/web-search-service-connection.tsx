import type { McpUserConfiguration } from '@clio/core/v3';
import { Spinner } from '@/components/ui/spinner';
import { vocab } from '@/lib/brand-vocabulary';
import { remoteUrlFromSpec, webSearchConnectionMatchesTarget } from './web-search-configuration';

/** Attachment state for one running Web Search deployment. */
export function WebSearchServiceConnection({
  connecting,
  connection,
  targetUrl,
}: {
  connecting: boolean;
  connection?: McpUserConfiguration;
  targetUrl?: string | null;
}) {
  if (connecting) {
    return (
      <div aria-live="polite" className="border-l-2 border-primary py-1 pl-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Spinner aria-hidden="true" /> Connecting search tools to {vocab.agent}…
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Checking the service and loading its tool catalog.
        </p>
      </div>
    );
  }
  if (!targetUrl) {
    return (
      <p className="text-sm text-destructive">
        {vocab.agent} could not determine this service address.
      </p>
    );
  }
  if (
    connection?.status === 'ready' &&
    webSearchConnectionMatchesTarget(true, connection, targetUrl)
  ) {
    return (
      <div className="border-l-2 border-emerald-500 py-1 pl-4 text-sm">
        <p className="font-medium text-emerald-500">Connected to {vocab.agent}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {connection.tools_count} tool{connection.tools_count === 1 ? '' : 's'} available
          {connection.tools.length ? `: ${connection.tools.join(', ')}` : '.'}
        </p>
      </div>
    );
  }
  const connectedUrl = remoteUrlFromSpec(connection?.spec);
  if (connection?.status === 'ready' && connectedUrl) {
    return (
      <div className="border-l-2 border-amber-500 py-1 pl-4 text-sm">
        <p className="font-medium text-amber-500">Another Web Search deployment is connected</p>
        <p className="mt-1 break-all text-xs text-muted-foreground">
          {connectedUrl} is connected to {vocab.agent}. Connect this deployment to switch targets.
        </p>
      </div>
    );
  }
  if (connection?.configured) {
    return (
      <div className="border-l-2 border-destructive py-1 pl-4 text-sm">
        <p className="font-medium text-destructive">Connection needs attention</p>
        <p className="mt-1 break-words text-xs text-destructive/90">
          {connection.error ?? 'The service is saved, but its tools did not respond.'}
        </p>
      </div>
    );
  }
  return (
    <div className="border-l-2 border-muted-foreground/40 py-1 pl-4 text-sm">
      <p className="font-medium">Not connected to {vocab.agent}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        The service is running, but its search and document tools are not available to sessions.
      </p>
    </div>
  );
}
