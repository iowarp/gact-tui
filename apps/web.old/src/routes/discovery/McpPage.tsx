/**
 * Discovery surface: Mcp Page component. Key export `McpPageProps`.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import './mcp-page.css';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { McpInstallModal } from '../../components/McpInstallModal.js';
import { useToast } from '../../components/Toast.js';
import {
  McpServerCard,
  RECONNECT_UNSUPPORTED_TITLE,
} from './McpServerCard.js';
import { filterMcpServers, isReconnectUnsupportedError } from './McpPageModel.js';

export interface McpPageProps {
  client: Client;
}

export function McpPage(props: McpPageProps) {
  const [data, { refetch }] = createResource(() => props.client.mcpServers());
  const [query, setQuery] = createSignal('');
  const [installOpen, setInstallOpen] = createSignal(false);
  const [busy, setBusy] = createSignal<string | null>(null);
  // Graceful degradation: clio advertises no capability flag for the
  // reconnect route, so we discover support empirically. The first 404
  // proves the route is absent on THIS backend (older clio on develop);
  // we latch this so every card's button disables and further clicks
  // don't re-fire a doomed request. The button stays honest on both old
  // and new backends instead of silently 404'ing (the W2 dead-button bug).
  const [reconnectUnsupported, setReconnectUnsupported] = createSignal(false);
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
    // Latched-off guard: once a 404 has marked the route unsupported the
    // button is disabled, but defend the handler too in case it fires.
    if (reconnectUnsupported()) return;
    setBusy(id);
    try {
      await props.client.reconnectMcpServer(id);
      toast.push({ tone: 'success', title: `Reconnected ${name}`, duration: 2400 });
      // Refetch so status / tool counts reflect the re-probed transport.
      void refetch();
    } catch (e) {
      if (isReconnectUnsupportedError(e)) {
        setReconnectUnsupported(true);
        toast.push({
          tone: 'info',
          title: 'Reconnect not available',
          body: RECONNECT_UNSUPPORTED_TITLE,
          duration: 5000,
        });
      } else {
        // 500 / network / etc. are transient — surface the error but
        // leave the button enabled so the user can retry.
        toast.push({
          tone: 'error',
          title: 'Reconnect failed',
          body: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      setBusy(null);
    }
  }

  const all = () => data()?.servers ?? [];
  const items = () => filterMcpServers(all(), query());
  return (
    <DiscoveryPage
      icon="mcp"
      title="MCP servers"
      subtitle="External tool providers available to this backend."
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
      onRetry={() => void refetch()}
      empty={!data.loading && items().length === 0}
      emptyTitle="No MCP servers"
      emptyBody="Install or enable a tool server to make its tools available in sessions."
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
      <div class="dp__grid mcp__grid">
        <For each={items()}>
          {(s) => (
            <McpServerCard
              s={s}
              client={props.client}
              busy={busy() === s.id}
              reconnectUnsupported={reconnectUnsupported()}
              onReconnect={() => void reconnect(s.id, s.name)}
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
