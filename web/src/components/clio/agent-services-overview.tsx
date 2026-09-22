import type { McpUserConfiguration, RelayStatus } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { ClioStatus } from '@/components/clio/status';
import { vocab } from '@/lib/brand-vocabulary';
import { remoteUrlFromSpec } from './web-search-configuration';

/** Compact topology for services attached to the currently connected agent. */
export function AgentServicesOverview({
  agentLabel,
  agentLocation,
  relay,
  webSearch,
  webSearchConnected,
}: {
  agentLabel?: string;
  agentLocation?: string;
  relay?: RelayStatus;
  webSearch?: McpUserConfiguration;
  webSearchConnected: boolean;
}) {
  const webSearchUrl = remoteUrlFromSpec(webSearch?.spec);
  const agent = agentIdentity(agentLabel, agentLocation);
  return (
    <section aria-labelledby="agent-services-title" className="border-y">
      <header className="flex flex-wrap items-end justify-between gap-3 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Connected agent
          </p>
          <h2 className="mt-1 text-xl font-semibold" id="agent-services-title">
            {agent}
          </h2>
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          These are attached to this agent. Switch agents from the top-left menu to inspect another
          agent; deployment targets below are computers, not agent connections.
        </p>
      </header>
      <div className="divide-y border-t">
        <ServiceConnectionRow
          detail={webSearchUrl ?? 'No service address configured'}
          location={serviceLocation(webSearchUrl, agentLocation)}
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
        <ServiceConnectionRow
          detail={relay?.mcp_url ?? 'No service address configured'}
          location={relay?.host ?? serviceLocation(relay?.mcp_url, agentLocation)}
          name={`${vocab.agent} Relay`}
          status={
            relay?.reachable ? 'Connected' : relay?.configured ? 'Unavailable' : 'Not connected'
          }
          statusValue={
            relay?.reachable ? 'healthy' : relay?.configured ? 'degraded' : 'unavailable'
          }
        />
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
}: {
  action?: { disabled?: boolean; label: string; onSelect: () => void };
  detail: string;
  location: string;
  name: string;
  status: string;
  statusValue: 'healthy' | 'degraded' | 'unavailable';
}) {
  return (
    <div className="grid gap-3 py-3 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1.3fr)_auto] sm:items-center">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">Runs on {location}</p>
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
