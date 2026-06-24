/**
 * Discovery surface: Agent Detail Panel component. Key export `AgentDetailPanel`.
 */
import { For, Show } from 'solid-js';
import type { AgentDef } from '@clio/core';
import {
  agentDetailViewModel,
  type AgentDetail,
} from './AgentDetailPanelModel.js';

export type { AgentDetail } from './AgentDetailPanelModel.js';

export function AgentDetailPanel(props: { agent: AgentDef; detail: AgentDetail }) {
  const vm = () => agentDetailViewModel(props.agent, props.detail);

  return (
    <div class="agent-detail">
      <dl class="agent-detail__facts">
        <DetailFact label="Source" value={vm().source} />
        <DetailFact label="Tier" value={vm().tier} />
        <Show when={vm().focus}>
          {(v) => <DetailFact label="Focus" value={v()} />}
        </Show>
        <Show when={vm().model}>
          {(v) => <DetailFact label="Model" value={v()} />}
        </Show>
      </dl>

      <Show when={vm().tools.length > 0}>
        <DetailChipGroup label="Tools" values={vm().tools} />
      </Show>
      <Show when={vm().keywords.length > 0}>
        <DetailChipGroup label="Keywords" values={vm().keywords} />
      </Show>
      <Show when={vm().routing.length > 0}>
        <DetailRows label="Routing" rows={vm().routing} />
      </Show>
      <Show when={vm().metadata.length > 0}>
        <DetailRows label="Metadata" rows={vm().metadata} />
      </Show>
    </div>
  );
}

function DetailFact(props: { label: string; value: string }) {
  return (
    <>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </>
  );
}

function DetailChipGroup(props: { label: string; values: string[] }) {
  return (
    <section class="agent-detail__section">
      <div class="agent-detail__section-title">{props.label}</div>
      <div class="agent-detail__chips">
        <For each={props.values}>{(v) => <span class="dp__tag">{v}</span>}</For>
      </div>
    </section>
  );
}

function DetailRows(props: { label: string; rows: Array<[string, string]> }) {
  return (
    <section class="agent-detail__section">
      <div class="agent-detail__section-title">{props.label}</div>
      <dl class="agent-detail__rows">
        <For each={props.rows}>
          {([k, v]) => (
            <>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </>
          )}
        </For>
      </dl>
    </section>
  );
}
