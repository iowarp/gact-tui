import { createResource, For, Show } from 'solid-js';
import type { Client, McpServerInfo } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface McpPageProps {
  client: Client;
}

export function McpPage(props: McpPageProps) {
  const [data, { refetch }] = createResource(() => props.client.mcpServers());
  const items = () => data()?.servers ?? [];
  return (
    <DiscoveryPage
      icon="mcp"
      title="MCP servers"
      subtitle="Model Context Protocol tool gateways wired into this backend."
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
      empty={!data.loading && items().length === 0}
      emptyTitle="No MCP servers"
      emptyBody="Register a server via the backend's tool gateway config."
    >
      <div class="dp__grid">
        <For each={items()}>{(s) => <McpServerCard s={s} />}</For>
      </div>
    </DiscoveryPage>
  );
}

function McpServerCard(props: { s: McpServerInfo }) {
  const tone = () => {
    switch (props.s.status) {
      case 'ready':
        return 'ok';
      case 'starting':
        return 'warn';
      case 'error':
      case 'disconnected':
        return 'err';
      default:
        return '';
    }
  };
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
              {props.s.transport} · {props.s.tools_count} tools
            </div>
          </div>
        </div>
        <span class={'dp__tag dp__tag--' + tone()}>{props.s.status}</span>
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
    </article>
  );
}
