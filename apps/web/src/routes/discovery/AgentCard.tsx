/**
 * Discovery surface: Agent Card component. Key export `AgentCard`.
 */
import { createSignal, For, Show } from 'solid-js';
import type { AgentDef, Client } from '@clio/core';
import { Icon } from '../../components/Icon.js';
import { AgentDetailPanel, type AgentDetail } from './AgentDetailPanel.js';

export function AgentCard(props: {
  agent: AgentDef;
  client: Client;
  onDelete?: () => void | Promise<void>;
}) {
  const tier = () => props.agent.tier ?? null;
  const [showDetail, setShowDetail] = createSignal(false);
  const [detail, setDetail] = createSignal<AgentDetail | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string | null>(null);

  async function toggle() {
    const next = !showDetail();
    setShowDetail(next);
    if (next && !detail() && !busy()) {
      setBusy(true);
      setErr(null);
      try {
        const d = await props.client.getAgent(props.agent.id);
        setDetail(d as AgentDetail);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <article
      class={'dp__card agent-card ' + (showDetail() ? 'dp__card--open' : '')}
      data-testid={`agent-card-${props.agent.id}`}
    >
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name={tier() === 1 ? 'sparkle' : 'agents'} size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.agent.title}</h3>
            <div class="dp__card-sub">{props.agent.id}</div>
          </div>
        </div>
        <div class="dp__card-head-aux">
          <Show when={tier() != null}>
            <span class="dp__tag dp__tag--cyan">tier {tier()}</span>
          </Show>
          <Show when={props.onDelete}>
            <button
              type="button"
              class="dp__card-remove"
              title="Remove agent"
              aria-label={`Remove agent ${props.agent.title ?? props.agent.id}`}
              onClick={() => void props.onDelete?.()}
              data-testid={`agent-delete-${props.agent.id}`}
            >
              <Icon name="close" size={13} />
            </button>
          </Show>
        </div>
      </header>
      <Show when={props.agent.description}>
        <p class="dp__card-body">{props.agent.description}</p>
      </Show>
      <Show when={props.agent.tools && props.agent.tools.length > 0}>
        <div class="dp__card-tags">
          <For each={props.agent.tools!}>{(t) => <span class="dp__tag">{t}</span>}</For>
        </div>
      </Show>
      <Show when={props.agent.keywords && props.agent.keywords.length > 0}>
        <div class="dp__card-tags">
          <For each={props.agent.keywords!}>
            {(k) => <span class="dp__tag">#{k}</span>}
          </For>
        </div>
      </Show>
      <button
        type="button"
        class="ws-card__repo-toggle"
        onClick={() => void toggle()}
        data-testid={`agent-detail-toggle-${props.agent.id}`}
      >
        <Icon
          name="chevron-right"
          size={11}
          class={'ws-card__repo-chev ' + (showDetail() ? 'is-open' : '')}
        />
        <span>{showDetail() ? 'Hide' : 'Show'} routing detail</span>
      </button>
      <Show when={showDetail()}>
        <div class="ws-card__repo" data-testid={`agent-detail-${props.agent.id}`}>
          <Show when={busy()}>
            <div class="ws-card__repo-status">Loading…</div>
          </Show>
          <Show when={err()}>
            <div class="ws-card__repo-err">{err()}</div>
          </Show>
          <Show when={!busy() && detail() !== null}>
            <AgentDetailPanel agent={props.agent} detail={detail()!} />
          </Show>
        </div>
      </Show>
    </article>
  );
}
