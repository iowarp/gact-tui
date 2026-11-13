import type { McpUserConfiguration } from '@clio/core/v3';
import { Spinner } from '@/components/ui/spinner';
import { vocab } from '@/lib/brand-vocabulary';
import { remoteUrlFromSpec, webSearchConnectionMatchesTarget } from './web-search-configuration';
import { plural, t } from '@lingui/core/macro';

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
  const { agent } = vocab;
  if (connecting) {
    return (
      <div aria-live="polite" className="border-l-2 border-primary py-1 pl-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Spinner aria-hidden="true" /> {t`Connecting search tools to ${agent}…`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t`Checking the service and loading its tool catalog.`}
        </p>
      </div>
    );
  }
  if (!targetUrl) {
    return (
      <p className="text-sm text-destructive">
        {t`${agent} could not determine this service address.`}
      </p>
    );
  }
  if (
    connection?.status === 'ready' &&
    webSearchConnectionMatchesTarget(true, connection, targetUrl)
  ) {
    const tools = connection.tools.join(', ');
    return (
      <div className="border-l-2 border-success py-1 pl-4 text-sm">
        <p className="font-medium text-success">{t`Connected to ${agent}`}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {tools
            ? plural(connection.tools_count, {
                one: `# tool available: ${tools}`,
                other: `# tools available: ${tools}`,
              })
            : plural(connection.tools_count, {
                one: '# tool available.',
                other: '# tools available.',
              })}
        </p>
      </div>
    );
  }
  const connectedUrl = remoteUrlFromSpec(connection?.spec);
  if (connection?.status === 'ready' && connectedUrl) {
    return (
      <div className="border-l-2 border-warning py-1 pl-4 text-sm">
        <p className="font-medium text-warning">{t`Another Web Search deployment is connected`}</p>
        <p className="mt-1 break-all text-xs text-muted-foreground">
          {t`${connectedUrl} is connected to ${agent}. Connect this deployment to switch targets.`}
        </p>
      </div>
    );
  }
  if (connection?.configured) {
    return (
      <div className="border-l-2 border-destructive py-1 pl-4 text-sm">
        <p className="font-medium text-destructive">{t`Connection needs attention`}</p>
        <p className="mt-1 break-words text-xs text-destructive/90">
          {connection.error ?? t`The service is saved, but its tools did not respond.`}
        </p>
      </div>
    );
  }
  return (
    <div className="border-l-2 border-muted-foreground/40 py-1 pl-4 text-sm">
      <p className="font-medium">{t`Not connected to ${agent}`}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t`The service is running, but its search and document tools are not available to sessions.`}
      </p>
    </div>
  );
}
