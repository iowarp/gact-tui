import type { McpUserConfiguration } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { ClioStatus } from '@/components/clio/status';
import { vocab } from '@/lib/brand-vocabulary';
import { remoteUrlFromSpec } from './web-search-configuration';
import { InfoTip } from './info-tip';

/** Compact topology for services attached to the currently connected agent. */
export function AgentServicesOverview({
  agentLabel,
  agentLocation,
  webSearch,
  webSearchConnected,
  onManageWebSearch,
}: {
  agentLabel?: string;
  agentLocation?: string;
  webSearch?: McpUserConfiguration;
  webSearchConnected: boolean;
  onManageWebSearch?: () => void;
}) {
  const webSearchUrl = remoteUrlFromSpec(webSearch?.spec);
  const localProcess = !webSearchUrl && typeof webSearch?.spec?.command === 'string';
  const agent = agentIdentity(agentLabel, agentLocation);
  return (
    <section aria-labelledby="agent-services-title">
      <header className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Connected {vocab.agent} ·</span>
        <h2 id="agent-services-title" className="font-medium text-foreground">
          {agent}
        </h2>
        <InfoTip label={`About the connected ${vocab.agent}`}>
          Services shown here are attached to this {vocab.agent}. Change the {vocab.agent}{' '}
          connection from the top-left menu. The execution host below identifies where a managed
          service runs.
        </InfoTip>
      </header>
      <div className="divide-y">
        {webSearch?.configured || webSearchConnected ? (
          <ServiceConnectionRow
            action={
              onManageWebSearch
                ? { label: 'Manage Web Search connection', onSelect: onManageWebSearch }
                : undefined
            }
            error={!webSearchConnected ? webSearch?.error : undefined}
            detail={
              webSearchUrl ?? (localProcess ? 'Local MCP process' : 'No service address configured')
            }
            location={
              localProcess
                ? displayName(agentLocation?.trim() || 'this computer')
                : serviceLocation(webSearchUrl, agentLocation)
            }
            name={`${vocab.agent} Web Search`}
            status={
              webSearchConnected
                ? 'Connected'
                : webSearch?.configured
                  ? 'Unavailable'
                  : 'Not connected'
            }
            statusValue={
              webSearchConnected ? 'healthy' : webSearch?.configured ? 'degraded' : 'unavailable'
            }
          />
        ) : null}
      </div>
    </section>
  );
}

function ServiceConnectionRow({
  action,
  detail,
  location,
  name,
  status,
  statusValue,
  error,
}: {
  action?: { disabled?: boolean; label: string; onSelect: () => void };
  detail: string;
  location: string;
  name: string;
  status: string;
  statusValue: 'healthy' | 'degraded' | 'unavailable';
  error?: string;
}) {
  return (
    <div className="grid gap-3 py-3 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1.3fr)_auto] sm:items-center">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">Runs on {location}</p>
        {error ? (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <p className="truncate font-mono text-xs text-muted-foreground" title={detail}>
        {detail}
      </p>
      <div className="flex items-center gap-2 sm:justify-end">
        <ClioStatus label={status} value={statusValue} />
        {action ? (
          <Button disabled={action.disabled} onClick={action.onSelect} size="sm" variant="ghost">
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function agentIdentity(label?: string, location?: string): string {
  const rawLocation = location?.trim() || 'Local';
  const normalizedLocation = rawLocation === '127.0.0.1' ? 'Local' : displayName(rawLocation);
  const trimmedLabel = label?.trim();
  const name =
    !trimmedLabel || ['this computer', 'this device'].includes(trimmedLabel.toLocaleLowerCase())
      ? vocab.agent
      : trimmedLabel.toLocaleLowerCase().startsWith(`${normalizedLocation.toLocaleLowerCase()} `)
        ? trimmedLabel.slice(normalizedLocation.length).trim() || vocab.agent
        : trimmedLabel;
  return `${normalizedLocation} › ${name}`;
}

function serviceLocation(url: string | undefined, agentLabel?: string): string {
  if (!url) return '—';
  try {
    const hostname = new URL(url).hostname;
    if (['127.0.0.1', 'localhost', '::1'].includes(hostname.toLocaleLowerCase())) {
      return displayName(agentLabel?.trim() || 'this computer');
    }
    return hostname;
  } catch {
    return 'configured address';
  }
}

function displayName(value: string): string {
  if (!/^[a-z0-9_-]+$/u.test(value)) return value;
  const words = value.replace(/[_-]+/gu, ' ');
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}
