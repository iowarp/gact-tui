/**
 * Discovery surface: Mcp Server Card component. Key export `McpServerCard`.
 */
import { createSignal, For, Show } from 'solid-js';
import type { Client, McpServerInfo } from '@clio/core';
import { Icon } from '../../components/Icon.js';
import { McpServerDetailPanel } from './McpServerDetailPanel.js';
import {
  mcpReconnectLabel,
  mcpReconnectTitle,
  mcpServerDetailToggleLabel,
  mcpServerStatusTone,
  mcpServerSubtitle,
} from './McpServerCardModel.js';
export { RECONNECT_UNSUPPORTED_TITLE } from './McpServerCardModel.js';

export function McpServerCard(props: {
  s: McpServerInfo;
  client: Client;
  busy: boolean;
  /** Latched when a prior reconnect 404'd -> the backend has no route. */
  reconnectUnsupported: boolean;
  onReconnect: () => void;
  onUninstall: () => void;
}) {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <article class="dp__card" data-testid={`mcp-card-${props.s.id}`}>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="mcp" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.s.name}</h3>
            <div class="dp__card-sub">
              {mcpServerSubtitle(props.s)}
            </div>
          </div>
        </div>
        <span class={'dp__tag dp__tag--' + mcpServerStatusTone(props.s.status)}>
          {props.s.status}
        </span>
      </header>
      <Show when={props.s.error}>
        <p class="dp__card-body" style="color:var(--color-error)">
          {props.s.error}
        </p>
      </Show>
      <Show when={props.s.tools.length > 0}>
        <div class="dp__card-tags">
          <For each={props.s.tools}>{(t) => <span class="dp__tag">{t}</span>}</For>
        </div>
      </Show>
      <button
        type="button"
        class="mcp__detail-toggle"
        onClick={() => setExpanded((v) => !v)}
        data-testid={`mcp-expand-${props.s.id}`}
      >
        <Icon
          name="chevron-right"
          size={11}
          class={'mcp__detail-chev ' + (expanded() ? 'is-open' : '')}
        />
        <span>{mcpServerDetailToggleLabel(expanded())}</span>
      </button>
      <Show when={expanded()}>
        <McpServerDetailPanel s={props.s} client={props.client} />
      </Show>
      <div class="dp__card-actions">
        <button
          type="button"
          class="dp__card-btn"
          disabled={props.busy || props.reconnectUnsupported}
          title={mcpReconnectTitle(props.reconnectUnsupported)}
          onClick={props.onReconnect}
          data-testid={`mcp-reconnect-${props.s.id}`}
        >
          {mcpReconnectLabel(props.busy)}
        </button>
        <button
          type="button"
          class="dp__card-btn dp__card-btn--danger"
          disabled={props.busy}
          onClick={props.onUninstall}
          data-testid={`mcp-uninstall-${props.s.id}`}
        >
          Uninstall
        </button>
      </div>
    </article>
  );
}
