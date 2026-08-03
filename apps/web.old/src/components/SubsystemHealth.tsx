/**
 * UI component: Subsystem Health. Exports `SubsystemHealth`.
 */
import { For, Show } from 'solid-js';
import type { HealthSnapshot } from '@clio/core';
import {
  healthStatusTone,
  overallHealthStatus,
} from '../routes/discovery/DoctorPageModel.js';
import { overallTone, type DoctorTone } from '../statusTones.js';
import './subsystem-health.css';

/**
 * Compact subsystem-health indicator (SPEC §3.4 integrations[]): a single
 * overall pip plus one pip per integration (memory / lm / sessions / api /
 * agent …). The full tabular view lives on the Doctor page; this is the
 * at-a-glance strip the TUI shows in its chrome. Pure presentational — the
 * caller owns fetching the `HealthSnapshot`.
 */
export function SubsystemHealth(props: { health?: HealthSnapshot }) {
  const integrations = () => props.health?.integrations ?? [];
  const overall = () => overallHealthStatus(props.health);
  const overallPipTone = (): DoctorTone => overallTone(overall());

  return (
    <Show when={props.health}>
      <div class="subhealth" data-testid="subsystem-health" title={`backend: ${overall()}`}>
        <span
          class={'subhealth__overall subhealth__pip--' + overallPipTone()}
          data-testid="subsystem-health-overall"
        >
          {overall()}
        </span>
        <Show when={integrations().length > 0}>
          <ul class="subhealth__list">
            <For each={integrations()}>
              {(i) => (
                <li
                  class="subhealth__item"
                  data-testid={`subsystem-health-${i.name}`}
                  title={`${i.name}: ${i.status}${i.detail ? ' — ' + i.detail : ''}`}
                >
                  <span class={'subhealth__pip subhealth__pip--' + healthStatusTone(i.status)} />
                  <span class="subhealth__name">{i.name}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </Show>
  );
}
