import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client, McpServerInfo } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { McpInstallModal } from '../../components/McpInstallModal.js';
import { useToast } from '../../components/Toast.js';

export interface McpPageProps {
  client: Client;
}

export function McpPage(props: McpPageProps) {
  const [data, { refetch }] = createResource(() => props.client.mcpServers());
  const [query, setQuery] = createSignal('');
  const [installOpen, setInstallOpen] = createSignal(false);
  const [busy, setBusy] = createSignal<string | null>(null);
  const toast = useToast();

  async function uninstall(id: string, name: string) {
    if (!confirm(`Uninstall MCP server "${name}"? This cannot be undone.`)) return;
    setBusy(id);
    try {
      await props.client.uninstallMcpServer(id);
      toast.push({ tone: 'success', title: 'Server uninstalled', body: name });
      void refetch();
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Uninstall failed',
        body: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  }

  async function reconnect(id: string, name: string) {
    setBusy(id);
    try {
      await props.client.reconnectMcpServer(id);
      toast.push({
        tone: 'info',
        title: 'Reconnect requested',
        body: name,
        duration: 2400,
      });
      void refetch();
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Reconnect failed',
        body: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  }
  const all = () => data()?.servers ?? [];
  const items = () => {
    const q = query().trim().toLowerCase();
    if (!q) return all();
    return all().filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.tools ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  };
  return (
    <DiscoveryPage
      icon="mcp"
      title="MCP servers"
      subtitle="Model Context Protocol tool gateways wired into this backend."
      actions={
        <>
          <button
            type="button"
            class="dp-iconbtn"
            onClick={() => setInstallOpen(true)}
            title="Install MCP server"
            data-testid="mcp-install-open"
          >
            <Icon name="plus" size={14} />
          </button>
          <button
            type="button"
            class="dp-iconbtn"
            onClick={() => refetch()}
            title="Refresh"
          >
            <Icon name="regenerate" size={14} />
          </button>
        </>
      }
      loading={data.loading}
      error={data.error ? String((data.error as Error).message ?? data.error) : null}
      empty={!data.loading && items().length === 0}
      emptyTitle="No MCP servers"
      emptyBody="Register a server via the backend's tool gateway config."
    >
      <Show when={all().length > 4}>
        <div class="dp__search-row">
          <Icon name="search" size={14} class="dp__search-icon" />
          <input
            type="text"
            class="dp__search-input"
            placeholder="Filter MCP servers by name, id, or tool…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            data-testid="mcp-search"
          />
        </div>
      </Show>
      <div class="dp__grid">
        <For each={items()}>
          {(s) => (
            <McpServerCard
              s={s}
              busy={busy() === s.id}
              onReconnect={() => reconnect(s.id, s.name)}
              onUninstall={() => uninstall(s.id, s.name)}
            />
          )}
        </For>
      </div>
      <McpInstallModal
        open={installOpen()}
        client={props.client}
        onInstalled={() => {
          setInstallOpen(false);
          toast.push({
            tone: 'success',
            title: 'MCP server installed',
            duration: 2400,
          });
          void refetch();
        }}
        onClose={() => setInstallOpen(false)}
      />
    </DiscoveryPage>
  );
}

function McpServerCard(props: {
  s: McpServerInfo;
  busy: boolean;
  onReconnect: () => void;
  onUninstall: () => void;
}) {
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
      <div class="dp__card-actions">
        <button
          type="button"
          class="dp__card-btn"
          disabled={props.busy}
          onClick={props.onReconnect}
          data-testid={`mcp-reconnect-${props.s.id}`}
        >
          {props.busy ? 'Working…' : 'Reconnect'}
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
