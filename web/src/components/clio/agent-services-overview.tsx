import type { McpUserConfiguration, RelayStatus } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { ClioStatus } from '@/components/clio/status';
import { vocab } from '@/lib/brand-vocabulary';
import { remoteUrlFromSpec } from './web-search-configuration';
import { InfoTip } from './info-tip';
import { humanizeProtocolValue } from './presentation-labels';

/** Compact topology for services attached to the currently connected agent. */
export function AgentServicesOverview({
  agentLabel,
  agentLocation,
  relay,
  webSearch,
  webSearchConnected,
  onManageWebSearch,
  onManageRelay,
}: {
  agentLabel?: string;
  agentLocation?: string;
  relay?: RelayStatus;
  webSearch?: McpUserConfiguration;
  webSearchConnected: boolean;
  onManageWebSearch?: () => void;
  onManageRelay?: () => void;
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
        <InfoTip label={`About the connected ${vocab.agent}`}>
          Services shown here are attached to this {vocab.agent}. Change the {vocab.agent}{' '}
          connection from the top-left menu. The execution host below identifies where a managed
          service runs.
        </InfoTip>
      </header>
      <div className="divide-y border-t">
        {webSearch?.configured || webSearchConnected ? (
          <ServiceConnectionRow
            action={
              onManageWebSearch
                ? { label: 'Manage Web Search connection', onSelect: onManageWebSearch }
                : undefined
            }
            error={!webSearchConnected ? webSearch?.error : undefined}
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
        ) : null}
        {relay?.configured ? (
          <ServiceConnectionRow
            action={
              onManageRelay
                ? { label: 'Manage Relay connection', onSelect: onManageRelay }
                : undefined
            }
            error={
              !relay.reachable
                ? relay.detail || (relay.reason ? humanizeProtocolValue(relay.reason) : undefined)
                : undefined
            }
            detail={relay?.mcp_url ?? 'No service address configured'}
            location={relay?.host ?? serviceLocation(relay?.mcp_url, agentLocation)}
            name={`${vocab.agent} Relay`}
            status={
              relay?.reachable
                ? 'Connected'
                : relay?.configured
                  ? 'Needs attention'
                  : 'Not connected'
            }
            statusValue={
              relay?.reachable ? 'healthy' : relay?.configured ? 'degraded' : 'unavailable'
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
