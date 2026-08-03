/**
 * Discovery surface: Doctor Page component. Key export `DoctorPageProps`.
 */
import { createResource, For, Show } from 'solid-js';
import type { Client, HealthIntegration } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { SubsystemHealth } from '../../components/SubsystemHealth.js';
import {
  capabilityGapRows,
  healthStatusColor,
  healthStatusTone,
  humanUptime,
  lspStatusTone,
  overallHealthMeaning,
  overallHealthStatus,
} from './DoctorPageModel.js';
import './doctor-page.css';

export interface DoctorPageProps {
  client: Client;
}

export function DoctorPage(props: DoctorPageProps) {
  const [data, { refetch }] = createResource(() => props.client.health());
  const [gapsData] = createResource(() => props.client.capabilityGaps().catch(() => null));
  const [lspData] = createResource(() => props.client.lspClients().catch(() => ({ clients: [] })));
  const integrations = () => data()?.integrations ?? [];
  const lspClients = () => lspData()?.clients ?? [];
  const gaps = () => capabilityGapRows(gapsData()?.capability_gaps);
  const overallStatus = () => overallHealthStatus(data());
  const overallMeaning = () => overallHealthMeaning(overallStatus());
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
      onRetry={() => void refetch()}
      empty={!data.loading && integrations().length === 0}
      emptyTitle="No integration data"
      emptyBody="Backend does not expose /v1/health or has no integrations registered."
    >
      <Show when={data()}>
        <SubsystemHealth health={data()} />
        <div class="dp__stats">
          <div class="dp__stat">
            <div class="dp__stat-label">overall</div>
            <div
              class="dp__stat-value"
              style={`color:${healthStatusColor(overallStatus())}`}
            >
              {overallStatus()}
            </div>
            <div class="dp__stat-sub">{overallMeaning()}</div>
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
      <Show when={lspClients().length > 0}>
        <div class="dp__section-title">LSP clients</div>
        <ul class="doc__list" data-testid="doctor-lsp">
          <For each={lspClients()}>
            {(c) => (
              <li class="doc__row" data-testid={`doctor-lsp-${c.name}`}>
                <span
                  class={
                    'doc__row-pip doc__row-pip--' + lspStatusTone(c.status)
                  }
                />
                <span class="doc__row-name">{c.name}</span>
                <Show when={c.language}>
                  <span class="dp__tag">{c.language}</span>
                </Show>
                <Show when={c.status}>
                  <span class="doc__row-status">{c.status}</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={gaps().length > 0}>
        <div class="dp__section-title">Capability gaps</div>
        <ul class="doc__gaps" data-testid="doctor-gaps">
          <For each={gaps()}>
            {(g) => (
              <li class="doc__gap" data-testid={`doctor-gap-${g.name}`}>
                <div class="doc__gap-head">
                  <span class="doc__gap-name">{g.name}</span>
                  <span class={'dp__tag dp__tag--' + (g.status === 'unsupported' ? 'warn' : '')}>
                    {g.status}
                  </span>
                  <Show when={g.category}>
                    <span class="dp__tag">{g.category}</span>
                  </Show>
                </div>
                <Show when={g.description}>
                  <p class="doc__gap-desc">{g.description}</p>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </DiscoveryPage>
  );
}

function IntegrationRow(props: { i: HealthIntegration }) {
  return (
    <li class="doc__row" data-testid={`doctor-integration-${props.i.name}`}>
      <span class={'doc__pip doc__pip--' + healthStatusTone(props.i.status)} />
      <div class="doc__row-main">
        <div class="doc__row-name">{props.i.name}</div>
        <Show when={props.i.detail}>
          <div class="doc__row-detail">{props.i.detail}</div>
        </Show>
      </div>
      <span class={'dp__tag dp__tag--' + healthStatusTone(props.i.status)}>{props.i.status}</span>
    </li>
  );
}
