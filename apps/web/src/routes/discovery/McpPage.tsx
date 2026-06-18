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

/** Tooltip + info-toast copy when the backend lacks the reconnect route. */
const RECONNECT_UNSUPPORTED_TITLE =
  'Not supported by this backend (needs clio-agent with MCP reconnect)';

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
      // HttpError (from @clio/core) carries a numeric `.status`. A 404
      // means the backend has no reconnect route — degrade gracefully:
      // disable every reconnect button + one explanatory info toast.
      const status = (e as { status?: number } | null)?.status;
      if (status === 404) {
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

function McpPromptRow(props: {
  s: McpServerInfo;
  p: { name: string; description?: string };
  client: Client;
}) {
  const [rendered, setRendered] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string | null>(null);

  async function load() {
    if (rendered() !== null) {
      setRendered(null);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await props.client.mcpGetPrompt(props.s.id, props.p.name, {});
      const text = (r.messages ?? [])
        .map((m) => `${m.role.toUpperCase()}\n${m.content.text ?? '[non-text]'}`)
        .join('\n\n');
      setRendered(text || '(empty)');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li class="mcp__detail-row mcp__detail-row--resource">
      <code class="mcp__detail-name">{props.p.name}</code>
      <Show when={props.p.description}>
        <span class="mcp__detail-desc">{props.p.description}</span>
      </Show>
      <div class="mcp__detail-actions">
        <button
          type="button"
          class="mcp__resource-preview"
          onClick={() => void load()}
          disabled={busy()}
          data-testid={`mcp-prompt-render-${props.s.id}-${props.p.name}`}
        >
          {busy() ? '…' : rendered() !== null ? 'Hide' : 'Render'}
        </button>
      </div>
      <Show when={err()}>
        <pre class="mcp__resource-err">{err()}</pre>
      </Show>
      <Show when={rendered() !== null}>
        <pre class="mcp__resource-text">{rendered()}</pre>
      </Show>
    </li>
  );
}

function McpResourceRow(props: {
  s: McpServerInfo;
  r: { uri: string; name?: string };
  client: Client;
}) {
  const [preview, setPreview] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string | null>(null);
  const [subscribed, setSubscribed] = createSignal(false);

  async function toggleSubscribe() {
    setErr(null);
    try {
      if (subscribed()) {
        await props.client.mcpUnsubscribeResource(props.s.id, props.r.uri);
        setSubscribed(false);
      } else {
        await props.client.mcpSubscribeResource(props.s.id, props.r.uri);
        setSubscribed(true);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function load() {
    if (preview() !== null) {
      setPreview(null);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await props.client.mcpReadResource(props.s.id, props.r.uri);
      const text = (r.contents ?? [])
        .map((c) => c.text ?? `[${c.mimeType ?? 'binary'}]`)
        .join('\n');
      setPreview(text || '(empty)');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li class="mcp__detail-row mcp__detail-row--resource">
      <code class="mcp__detail-name">{props.r.uri}</code>
      <Show when={props.r.name}>
        <span class="mcp__detail-desc">{props.r.name}</span>
      </Show>
      <div class="mcp__detail-actions">
        <button
          type="button"
          class="mcp__resource-preview"
          onClick={() => void load()}
          disabled={busy()}
          data-testid={`mcp-resource-preview-${props.s.id}-${props.r.uri}`}
        >
          {busy() ? '…' : preview() !== null ? 'Hide' : 'Preview'}
        </button>
        <button
          type="button"
          class="mcp__resource-preview"
          onClick={() => void toggleSubscribe()}
          data-testid={`mcp-resource-sub-${props.s.id}-${props.r.uri}`}
        >
          {subscribed() ? '✓ Subscribed' : 'Subscribe'}
        </button>
      </div>
      <Show when={err()}>
        <pre class="mcp__resource-err">{err()}</pre>
      </Show>
      <Show when={preview() !== null}>
        <pre class="mcp__resource-text">{preview()}</pre>
      </Show>
    </li>
  );
}

function McpServerCard(props: {
  s: McpServerInfo;
  client: Client;
  busy: boolean;
  /** Latched when a prior reconnect 404'd → the backend has no route. */
  reconnectUnsupported: boolean;
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
      const [toolsR, resR, promptsR, tmplR] = await Promise.allSettled([
        props.client.mcpServerTools(sid),
        props.client.mcpServerResources(sid),
        props.client.mcpServerPrompts(sid),
        props.client.mcpServerResourceTemplates(sid),
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
        templates:
          tmplR.status === 'fulfilled'
            ? (tmplR.value.templates as Array<{ uriTemplate: string; name?: string; description?: string }>)
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
                    {(r) => <McpResourceRow s={props.s} r={r} client={props.client} />}
                  </For>
                </ul>
              </div>
            </Show>
            <Show when={(detail()?.prompts ?? []).length > 0}>
              <div class="mcp__detail-section">
                <div class="mcp__detail-title">Prompts</div>
                <ul class="mcp__detail-list">
                  <For each={detail()?.prompts ?? []}>
                    {(p) => <McpPromptRow s={props.s} p={p} client={props.client} />}
                  </For>
                </ul>
              </div>
            </Show>
            <Show when={(detail()?.templates ?? []).length > 0}>
              <div class="mcp__detail-section">
                <div class="mcp__detail-title">Resource templates</div>
                <ul class="mcp__detail-list">
                  <For each={detail()?.templates ?? []}>
                    {(t) => (
                      <li class="mcp__detail-row">
                        <code class="mcp__detail-name">{t.uriTemplate}</code>
                        <Show when={t.description}>
                          <span class="mcp__detail-desc">{t.description}</span>
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
                (detail()?.prompts.length ?? 0) === 0 &&
                (detail()?.templates?.length ?? 0) === 0
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
          disabled={props.busy || props.reconnectUnsupported}
          title={props.reconnectUnsupported ? RECONNECT_UNSUPPORTED_TITLE : undefined}
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
