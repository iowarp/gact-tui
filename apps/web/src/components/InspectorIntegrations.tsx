/**
 * Inspector 'Integrations' tab: shows MCP/integration health status.
 * Exports {@link IntegrationsTab} and the {@link IntegrationStatus} shape.
 */
import { For, Show } from 'solid-js';

export interface IntegrationStatus {
  name: string;
  status: 'ready' | 'degraded' | 'unavailable' | 'skipped';
  summary?: string;
}

export interface IntegrationsTabProps {
  integrations: IntegrationStatus[];
}

export function IntegrationsTab(props: IntegrationsTabProps) {
  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">Integrations</div>
      <ul class="inspector__integrations">
        <For each={props.integrations}>
          {(integration) => (
            <li class={'inspector__integration inspector__integration--' + integration.status}>
              <span class="inspector__integration-dot" />
              <span class="inspector__integration-name">{integration.name}</span>
              <Show when={integration.summary}>
                <span class="inspector__integration-summary">{integration.summary}</span>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
