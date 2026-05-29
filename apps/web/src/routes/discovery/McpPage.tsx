import { createResource, createSignal, For, Show } from 'solid-js';
import './mcp-page.css';
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
              client={props.client}
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
  client: Client;
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
  const [expanded, setExpanded] = createSignal(false);

  // Lazy-fetch full detail when the user expands the card. Three
  // parallel calls so the worst case is one round-trip ≈ slowest of
  // tools/resources/prompts. Each catch-handles independently — a
  // server that advertises tools but not resources still shows the
  // tools.
  const [detail] = createResource(
    () => (expanded() ? props.s.id : null),
    async (sid) => {
      if (!sid) return null;
      const [toolsR, resR, promptsR] = await Promise.allSettled([
        props.client.mcpServerTools(sid),
        props.client.mcpServerResources(sid),
        props.client.mcpServerPrompts(sid),
      ]);
      return {
        tools:
          toolsR.status === 'fulfilled'
            ? (toolsR.value.tools as Array<{ name: string; description?: string }>)
            : [],
        resources:
          resR.status === 'fulfilled'
            ? (resR.value.resources as Array<{ uri: string; name?: string }>)
            : [],
        prompts:
          promptsR.status === 'fulfilled'
            ? (promptsR.value.prompts as Array<{ name: string; description?: string }>)
            : [],
      };
    },
  );

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
        <span>{expanded() ? 'Hide details' : 'Show tools, resources & prompts'}</span>
      </button>
      <Show when={expanded()}>
        <div class="mcp__detail">
          <Show when={detail.loading}>
            <div class="mcp__detail-status">Loading…</div>
          </Show>
          <Show when={!detail.loading && detail()}>
            <Show when={(detail()?.tools ?? []).length > 0}>
              <div class="mcp__detail-section">
                <div class="mcp__detail-title">Tools</div>
                <ul class="mcp__detail-list">
                  <For each={detail()?.tools ?? []}>
                    {(t) => (
                      <li class="mcp__detail-row">
                        <code class="mcp__detail-name">{t.name}</code>
                        <Show when={t.description}>
                          <span class="mcp__detail-desc">{t.description}</span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
            <Show when={(detail()?.resources ?? []).length > 0}>
              <div class="mcp__detail-section">
                <div class="mcp__detail-title">Resources</div>
                <ul class="mcp__detail-list">
                  <For each={detail()?.resources ?? []}>
                    {(r) => (
                      <li class="mcp__detail-row">
                        <code class="mcp__detail-name">{r.uri}</code>
                        <Show when={r.name}>
                          <span class="mcp__detail-desc">{r.name}</span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
            <Show when={(detail()?.prompts ?? []).length > 0}>
              <div class="mcp__detail-section">
                <div class="mcp__detail-title">Prompts</div>
                <ul class="mcp__detail-list">
                  <For each={detail()?.prompts ?? []}>
                    {(p) => (
                      <li class="mcp__detail-row">
                        <code class="mcp__detail-name">{p.name}</code>
                        <Show when={p.description}>
                          <span class="mcp__detail-desc">{p.description}</span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
            <Show
              when={
                (detail()?.tools.length ?? 0) === 0 &&
                (detail()?.resources.length ?? 0) === 0 &&
                (detail()?.prompts.length ?? 0) === 0
              }
            >
              <div class="mcp__detail-status">No detail available.</div>
            </Show>
          </Show>
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
