import { createResource, For, Show } from 'solid-js';
import type { Client, HealthIntegration } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface DoctorPageProps {
  client: Client;
}

export function DoctorPage(props: DoctorPageProps) {
  const [data, { refetch }] = createResource(() => props.client.health());
  const integrations = () => data()?.integrations ?? [];
  return (
    <DiscoveryPage
      icon="doctor"
      title="Doctor"
      subtitle="Live health snapshot of the backend's integrations + dependencies."
      actions={
        <button
          type="button"
          class="dp-iconbtn"
          onClick={() => refetch()}
          title="Refresh"
        >
          <Icon name="regenerate" size={14} />
        </button>
      }
      loading={data.loading}
      error={data.error ? String((data.error as Error).message ?? data.error) : null}
      empty={!data.loading && integrations().length === 0}
      emptyTitle="No integration data"
      emptyBody="Backend does not expose /v1/health or has no integrations registered."
    >
      <Show when={data()}>
        <div class="dp__stats">
          <div class="dp__stat">
            <div class="dp__stat-label">overall</div>
            <div
              class="dp__stat-value"
              style={`color:${healthColor(data()?.overall_status ?? '')}`}
            >
              {data()?.overall_status ?? (data()?.healthy ? 'healthy' : 'unknown')}
            </div>
            <div class="dp__stat-sub">healthy: {String(data()?.healthy ?? false)}</div>
          </div>
          <div class="dp__stat">
            <div class="dp__stat-label">uptime</div>
            <div class="dp__stat-value">{humanUptime(data()?.uptime_s ?? 0)}</div>
            <div class="dp__stat-sub">{data()?.uptime_s ?? 0}s</div>
          </div>
        </div>
      </Show>
      <div class="dp__section-title">Integrations</div>
      <ul class="doc__list" data-testid="doctor-integrations">
        <For each={integrations()}>{(i) => <IntegrationRow i={i} />}</For>
      </ul>
    </DiscoveryPage>
  );
}

function IntegrationRow(props: { i: HealthIntegration }) {
  return (
    <li class="doc__row" data-testid={`doctor-integration-${props.i.name}`}>
      <span class={'doc__pip doc__pip--' + statusTone(props.i.status)} />
      <div class="doc__row-main">
        <div class="doc__row-name">{props.i.name}</div>
        <Show when={props.i.detail}>
          <div class="doc__row-detail">{props.i.detail}</div>
        </Show>
      </div>
      <span class={'dp__tag dp__tag--' + statusTone(props.i.status)}>{props.i.status}</span>
    </li>
  );
}

function statusTone(s: string): 'ok' | 'warn' | 'err' | '' {
  if (s === 'ready') return 'ok';
  if (s === 'degraded') return 'warn';
  if (s === 'unavailable') return 'err';
  return '';
}

function healthColor(overall: string): string {
  if (overall === 'healthy' || overall === 'ready') return 'var(--color-success)';
  if (overall === 'degraded') return 'var(--color-warning)';
  if (overall === 'unavailable') return 'var(--color-error)';
  return 'var(--color-heading)';
}

function humanUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
