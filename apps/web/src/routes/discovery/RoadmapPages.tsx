/**
 * Read-only discovery pages for the GACT v0.2 surfaces the desktop
 * doesn't yet have a write-flow for: hooks, policies, agent
 * blueprints, expert packs. Surfacing them in Settings makes them
 * discoverable (instead of users having to edit YAML on disk and
 * not knowing where to look).
 */

import { createResource, createSignal, For, Show } from 'solid-js';
import type { BlueprintSource, Client, HookEvent } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import './hooks-page.css';

export interface ClientPageProps {
  client: Client;
}

/** The six declarative-hook event kinds clio accepts (live x_clio_hook_events). */
const HOOK_EVENTS: HookEvent[] = [
  'pre_tool',
  'post_tool',
  'pre_message',
  'post_message',
  'semantic_event',
  'on_error',
];

/**
 * Hooks page. Two distinct surfaces, deliberately separated so the user
 * isn't misled about which hooks actually run on this build:
 *
 *  1. Runtime hooks (GAP 4) — the file-based Python handlers clio loaded
 *     from CLIO_HOOKS_DIR at boot. These are what FIRE during turns, but
 *     are read-only at runtime. Surfaced from `/v1/capabilities`
 *     (x_clio_hook_backend + x_clio_hook_events).
 *
 *  2. Declarative hooks (GAP 2 / GAP 5) — the editable `/v1/hooks` list.
 *     clio STORES these rows but does NOT yet dispatch them during turns
 *     on this build (storage-only). The editor sends the real wire shape
 *     ({event, command|url}); the previous {type, handler_uri} body 400'd.
 */
export function HooksPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.hooks().catch(() => ({ hooks: [] })),
  );
  const items = () => data()?.hooks ?? [];

  // Runtime-hook status (read-only) from backend capabilities.
  const [caps] = createResource(() => props.client.capabilities().catch(() => null));
  // The hook fields live inside the nested `capabilities` flag bag. Bracket
  // access + cast-through-unknown because the wire CapabilityFlags index
  // signature is `boolean | undefined` (owned by another agent — not ours
  // to widen). Tolerate both the nested and the envelope-top-level shape.
  const flags = () => {
    const c = caps() as unknown as Record<string, unknown> | null;
    const nested = (c?.['capabilities'] ?? c) as Record<string, unknown> | undefined;
    return nested;
  };
  const runtimeBackend = () =>
    (flags()?.['x_clio_hook_backend'] as unknown as string | undefined) ?? 'none';
  const runtimeEvents = () =>
    (flags()?.['x_clio_hook_events'] as unknown as Record<string, number> | undefined) ?? {};

  const [hEvent, setHEvent] = createSignal<HookEvent>('pre_message');
  const [handlerKind, setHandlerKind] = createSignal<'command' | 'url'>('command');
  const [hValue, setHValue] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function submitNew(ev: SubmitEvent) {
    ev.preventDefault();
    const value = hValue().trim();
    if (!value || busy()) return;
    setBusy(true);
    setError(null);
    try {
      // Send whichever of command / url the user filled in. clio requires
      // a non-empty `event` plus exactly one of command|url.
      const body =
        handlerKind() === 'url'
          ? { event: hEvent(), url: value }
          : { event: hEvent(), command: value };
      await props.client.createHook(body);
      setHValue('');
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeHook(id: string) {
    try {
      await props.client.deleteHook(id);
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <DiscoveryPage
      icon="tool"
      title="Hooks"
      subtitle="Two surfaces: the file-based runtime hooks that actually fire during turns (read-only, loaded at backend start), and the declarative hooks below — which this clio build stores but does not yet dispatch."
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
    >
      {/* GAP 4 — read-only runtime hook status from capabilities. */}
      <section class="rmp__panel" data-testid="hooks-runtime-panel">
        <header class="rmp__panel-head">
          <h2 class="rmp__panel-title">Runtime hooks</h2>
          <span class="rmp__panel-note">
            file-based, loaded at backend start — read-only
          </span>
        </header>
        <div class="rmp__panel-row">
          <span class="rmp__panel-label">backend</span>
          <code
            class={
              'rmp__panel-backend' +
              (runtimeBackend() === 'none' || runtimeBackend() === 'unavailable'
                ? ' rmp__panel-backend--off'
                : '')
            }
            data-testid="hooks-runtime-backend"
          >
            {runtimeBackend()}
          </code>
        </div>
        <Show when={runtimeBackend() !== 'none' && runtimeBackend() !== 'unavailable'}>
          <div class="rmp__panel-chips">
            <For each={HOOK_EVENTS}>
              {(evt) => {
                const count = () => runtimeEvents()[evt] ?? 0;
                return (
                  <span
                    class={'rmp__chip' + (count() === 0 ? ' rmp__chip--muted' : '')}
                    data-testid={`hooks-runtime-count-${evt}`}
                  >
                    {evt} × {count()}
                  </span>
                );
              }}
            </For>
          </div>
        </Show>
      </section>

      {/* GAP 2 / GAP 5 — editable declarative hook list. */}
      <h2 class="dp__section-title">Declarative hooks</h2>
      <Show when={!data.loading && items().length === 0 && !error()}>
        <div
          class="dp__empty"
          data-testid="hooks-empty-hint"
          style="padding-block: 16px"
        >
          <div class="dp__empty-icon">
            <Icon name="tool" size={28} />
          </div>
          <h2 class="dp__empty-title">No declarative hooks registered</h2>
          <p class="dp__empty-body">
            Declarative hooks bind an event kind to a local command or an HTTP URL.
            This clio build stores them but does not yet dispatch them during turns —
            the runtime hooks above are what fire today. Add one below.
          </p>
        </div>
      </Show>
      <ul class="rmp__list" data-testid="hooks-list">
        <For each={items()}>
          {(h) => (
            <li class="rmp__row" data-testid={`hook-${h.id}`}>
              <span class={'rmp__tag rmp__tag--' + h.event}>{h.event}</span>
              <span class="rmp__name">{h.id}</span>
              <code class="rmp__uri">{h.command || h.url}</code>
              <button
                type="button"
                class="rmp__row-x"
                title="Delete hook"
                aria-label={`Delete hook ${h.id}`}
                onClick={() => void removeHook(h.id)}
                data-testid={`hook-delete-${h.id}`}
              >
                <Icon name="close" size={10} />
              </button>
            </li>
          )}
        </For>
      </ul>
      <form class="rmp__form rmp__form--hooks" onSubmit={submitNew} data-testid="hook-form">
        <select
          class="rmp__form-select"
          value={hEvent()}
          onChange={(e) => setHEvent(e.currentTarget.value as HookEvent)}
          data-testid="hook-event"
        >
          <For each={HOOK_EVENTS}>
            {(evt) => <option value={evt}>{evt}</option>}
          </For>
        </select>
        <select
          class="rmp__form-select"
          value={handlerKind()}
          onChange={(e) => setHandlerKind(e.currentTarget.value as 'command' | 'url')}
          data-testid="hook-handler-kind"
        >
          <option value="command">command</option>
          <option value="url">url</option>
        </select>
        <input
          class="rmp__form-input"
          type="text"
          placeholder={
            handlerKind() === 'url'
              ? 'http://localhost:9999/hook'
              : './scripts/on-hook.sh'
          }
          value={hValue()}
          onInput={(e) => setHValue(e.currentTarget.value)}
          data-testid="hook-value"
        />
        <button
          type="submit"
          class="rmp__form-add"
          disabled={busy() || !hValue().trim()}
          data-testid="hook-add"
        >
          <Icon name="plus" size={12} />
          <span>{busy() ? 'Adding…' : 'Add'}</span>
        </button>
      </form>
      <Show when={error()}>
        <p class="rmp__form-err">{error()}</p>
      </Show>
    </DiscoveryPage>
  );
}

/** Policies: tool / command / memory autonomy gates. */
export function PoliciesPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.policies().catch(() => null),
  );
  const policies = () => (data() as { policies?: Record<string, unknown> } | null)?.policies ?? {};
  const entries = () => Object.entries(policies()) as Array<[string, unknown]>;

  const [draft, setDraft] = createSignal<string>('');
  const [editing, setEditing] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  function startEdit() {
    setDraft(JSON.stringify(policies(), null, 2));
    setEditing(true);
    setError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  async function saveEdit() {
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(draft());
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setBusy(true);
    try {
      await props.client.putPolicies({ policies: parsed });
      setEditing(false);
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DiscoveryPage
      icon="agents"
      title="Policies"
      subtitle="Workspace + global autonomy policy that gates tools, commands, and memory access. Edit the JSON to relax or tighten gates."
      actions={
        <>
          <Show when={!editing()}>
            <button
              type="button"
              class="dp-iconbtn"
              onClick={startEdit}
              title="Edit policies"
              data-testid="policies-edit"
            >
              <Icon name="edit" size={14} />
            </button>
          </Show>
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
      empty={!data.loading && entries().length === 0 && !editing()}
      emptyTitle="No policy returned"
      emptyBody="Backend exposes /v1/policies but no entries are configured. Click Edit to add one."
    >
      <Show
        when={editing()}
        fallback={
          <div class="rmp__pretty">
            <pre>{JSON.stringify(policies(), null, 2)}</pre>
          </div>
        }
      >
        <textarea
          class="rmp__editor"
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          rows={16}
          data-testid="policies-editor"
        />
        <Show when={error()}>
          <p class="rmp__form-err">{error()}</p>
        </Show>
        <div class="rmp__editor-actions">
          <button
            type="button"
            class="ws-form__btn"
            onClick={cancelEdit}
            disabled={busy()}
          >
            Cancel
          </button>
          <button
            type="button"
            class="ws-form__btn ws-form__btn--primary"
            onClick={() => void saveEdit()}
            disabled={busy()}
            data-testid="policies-save"
          >
            {busy() ? 'Saving…' : 'Save policies'}
          </button>
        </div>
      </Show>
    </DiscoveryPage>
  );
}

/** Agent blueprints (#386 / #387). Read + install + uninstall. */
export function BlueprintsPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.agentBlueprints().catch(() => ({ blueprints: [] })),
  );
  const items = () => data()?.blueprints ?? [];

  const [installOpen, setInstallOpen] = createSignal(false);
  const [pathText, setPathText] = createSignal('');
  const [scope, setScope] = createSignal<'workspace' | 'global'>('workspace');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function uninstall(id: string, name: string, bpScope?: string) {
    if (!confirm(`Uninstall blueprint "${name}"? This cannot be undone.`)) return;
    try {
      // Pass the blueprint's own scope so global installs can actually be
      // matched (clio's DELETE defaults to workspace scope) — W2 wire fix.
      await props.client.uninstallAgentBlueprint(
        id,
        bpScope === 'global' || bpScope === 'workspace'
          ? { scope: bpScope }
          : undefined,
      );
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submitInstall(ev: SubmitEvent) {
    ev.preventDefault();
    setError(null);
    const src = pathText().trim();
    if (!src) {
      setError('Enter a blueprint path on the clio host, or a git URL.');
      return;
    }
    // clio validates a blueprint on DISK by path; a git/URL source is
    // cloned only at install time, so only path sources can be pre-validated.
    const looksRemote = /:\/\//.test(src) || src.startsWith('git@');
    setBusy(true);
    try {
      if (!looksRemote) {
        const v = await props.client.validateAgentBlueprint({ path: src, scope: scope() });
        if (!v.ok) {
          setError(`Validation failed: ${v.errors.join('; ') || 'no detail'}`);
          return;
        }
      }
      await props.client.installAgentBlueprint({ source: src, scope: scope() });
      setPathText('');
      setInstallOpen(false);
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DiscoveryPage
      icon="agents"
      title="Agent blueprints"
      subtitle="DSPy + MCP descriptor bundles the orchestrator can route into. Install one by path (on the clio host) or git URL to add a new expert routing path."
      actions={
        <>
          <button
            type="button"
            class="dp-iconbtn"
            onClick={() => setInstallOpen((v) => !v)}
            title="Install blueprint"
            data-testid="blueprint-install-toggle"
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
    >
      <Show when={installOpen()}>
        <form class="rmp__install" onSubmit={submitInstall}>
          <label class="rmp__install-label" for="bp-install">
            Blueprint path (on the clio host) or git URL
          </label>
          <input
            id="bp-install"
            class="rmp__editor"
            type="text"
            placeholder="src/clio_agent/agent_blueprints/builtin/data-exploration · or https://github.com/org/bp.git"
            value={pathText()}
            onInput={(e) => setPathText(e.currentTarget.value)}
            data-testid="blueprint-install-input"
          />
          <label class="rmp__install-label" for="bp-scope">
            Scope
          </label>
          <select
            id="bp-scope"
            class="rmp__editor"
            value={scope()}
            onChange={(e) => setScope(e.currentTarget.value as 'workspace' | 'global')}
            data-testid="blueprint-install-scope"
          >
            <option value="workspace">workspace</option>
            <option value="global">global</option>
          </select>
          <Show when={error()}>
            <p class="rmp__form-err">{error()}</p>
          </Show>
          <div class="rmp__editor-actions">
            <button
              type="button"
              class="ws-form__btn"
              onClick={() => setInstallOpen(false)}
              disabled={busy()}
            >
              Cancel
            </button>
            <button
              type="submit"
              class="ws-form__btn ws-form__btn--primary"
              disabled={busy() || !pathText().trim()}
              data-testid="blueprint-install-submit"
            >
              {busy() ? 'Validating…' : 'Validate + install'}
            </button>
          </div>
        </form>
      </Show>
      <BlueprintSourcesPanel client={props.client} />
      <h2 class="dp__section-title">Installed blueprints</h2>
      <Show when={!data.loading && items().length === 0}>
        <div class="dp__empty" data-testid="blueprints-empty" style="padding-block: 16px">
          <div class="dp__empty-icon">
            <Icon name="agents" size={28} />
          </div>
          <h2 class="dp__empty-title">No blueprints installed</h2>
          <p class="dp__empty-body">
            Install one by path (on the clio host) or a git URL via the + button,
            or register a source above to scan a registry.
          </p>
        </div>
      </Show>
      <div class="dp__grid">
        <For each={items()}>
          {(bp) => (
            <article class="dp__card" data-testid={`blueprint-${bp.id}`}>
              <header class="dp__card-head">
                <div class="dp__card-title-row">
                  <div class="dp__card-icon">
                    <Icon name="agents" size={14} />
                  </div>
                  <div style="min-width:0">
                    <h3 class="dp__card-title">{bp.name ?? bp.id}</h3>
                    <div class="dp__card-sub">{bp.id}</div>
                  </div>
                </div>
              </header>
              <Show when={bp.description}>
                <p class="dp__card-body">{bp.description}</p>
              </Show>
              <div class="dp__card-actions">
                <button
                  type="button"
                  class="dp__card-btn dp__card-btn--danger"
                  onClick={() =>
                    void uninstall(
                      bp.id,
                      bp.name ?? bp.id,
                      (bp as { scope?: string }).scope,
                    )
                  }
                  data-testid={`blueprint-uninstall-${bp.id}`}
                >
                  Uninstall
                </button>
              </div>
            </article>
          )}
        </For>
      </div>
    </DiscoveryPage>
  );
}

/**
 * A3 — Agent blueprint *sources* management.
 *
 * Sources are the git/local registries clio scans for installable
 * blueprints (distinct from the installed blueprints listed above).
 * Backed by GET/POST/DELETE /v1/agent-blueprints/sources and the
 * per-source POST .../{id}/refresh re-scan. Lives inline on the
 * Agent blueprints page so the two surfaces sit together.
 */
function BlueprintSourcesPanel(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.blueprintSources().catch(() => ({ sources: [] as BlueprintSource[] })),
  );
  const sources = () => data()?.sources ?? [];

  const [source, setSource] = createSignal('');
  const [ref, setRef] = createSignal('');
  const [name, setName] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  // Track per-row in-flight refresh so the dot can show "checking".
  const [refreshing, setRefreshing] = createSignal<Record<string, boolean>>({});

  async function submitAdd(ev: SubmitEvent) {
    ev.preventDefault();
    setError(null);
    const src = source().trim();
    if (!src) {
      setError('Enter a git URL or local path for the source.');
      return;
    }
    setBusy(true);
    try {
      const body: { source: string; ref?: string; name?: string } = { source: src };
      const r = ref().trim();
      const n = name().trim();
      if (r) body.ref = r;
      if (n) body.name = n;
      await props.client.addBlueprintSource(body);
      setSource('');
      setRef('');
      setName('');
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refresh(id: string) {
    setRefreshing((m) => ({ ...m, [id]: true }));
    setError(null);
    try {
      await props.client.refreshBlueprintSource(id);
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    }
  }

  async function remove(s: BlueprintSource) {
    if (!confirm(`Remove blueprint source "${s.name || s.source}"?`)) return;
    setError(null);
    try {
      await props.client.deleteBlueprintSource(s.id);
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const dotClass = (status: string) => {
    // Live clio reports "ready" on a healthy git/local source and "ok"
    // for in-tree registries; both are green. "error" is red; anything
    // else (incl. the initial "unknown" before first scan) is grey.
    if (status === 'ok' || status === 'ready') return 'bps__dot bps__dot--ok';
    if (status === 'error') return 'bps__dot bps__dot--error';
    return 'bps__dot bps__dot--unknown';
  };

  return (
    <section class="rmp__panel" data-testid="blueprint-sources-panel">
      <header class="rmp__panel-head">
        <h2 class="rmp__panel-title">Sources</h2>
        <span class="rmp__panel-note">
          git / local registries clio scans for installable blueprints
        </span>
      </header>

      <Show
        when={!data.loading && sources().length === 0}
        fallback={
          <ul class="rmp__list" data-testid="blueprint-sources-list">
            <For each={sources()}>
              {(s) => (
                <li class="rmp__row" data-testid={`blueprint-source-row-${s.id}`}>
                  <span
                    class={dotClass(s.status)}
                    title={s.status_message || s.status}
                    aria-label={`status: ${s.status}`}
                  />
                  <span class="rmp__name">{s.name || s.source}</span>
                  <code class="rmp__uri" title={s.source}>
                    {s.source}
                    <Show when={s.ref}>
                      {' '}
                      <span class="bps__ref">@{s.ref}</span>
                    </Show>
                  </code>
                  <Show when={s.status_message}>
                    <span class="bps__msg" title={s.status_message}>
                      {s.status_message}
                    </span>
                  </Show>
                  <button
                    type="button"
                    class="bps__btn"
                    title="Refresh source"
                    aria-label={`Refresh source ${s.name || s.source}`}
                    disabled={!!refreshing()[s.id]}
                    onClick={() => void refresh(s.id)}
                    data-testid={`blueprint-source-refresh-${s.id}`}
                  >
                    <Icon name="regenerate" size={12} />
                  </button>
                  <button
                    type="button"
                    class="rmp__row-x"
                    title="Remove source"
                    aria-label={`Remove source ${s.name || s.source}`}
                    onClick={() => void remove(s)}
                    data-testid={`blueprint-source-remove-${s.id}`}
                  >
                    <Icon name="close" size={10} />
                  </button>
                </li>
              )}
            </For>
          </ul>
        }
      >
        <div
          class="dp__empty"
          data-testid="blueprint-sources-empty"
          style="padding-block: 16px"
        >
          <div class="dp__empty-icon">
            <Icon name="branch" size={28} />
          </div>
          <h2 class="dp__empty-title">No blueprint sources registered</h2>
          <p class="dp__empty-body">
            Add a git URL or local path below to point clio at a registry of
            installable blueprints.
          </p>
        </div>
      </Show>

      <form
        class="rmp__form bps__form"
        onSubmit={submitAdd}
        data-testid="blueprint-source-add-form"
      >
        <input
          class="rmp__form-input"
          type="text"
          placeholder="https://github.com/org/blueprints.git · or /path/to/registry"
          value={source()}
          onInput={(e) => setSource(e.currentTarget.value)}
          data-testid="blueprint-source-input"
        />
        <input
          class="rmp__form-input"
          type="text"
          placeholder="ref (optional)"
          value={ref()}
          onInput={(e) => setRef(e.currentTarget.value)}
          data-testid="blueprint-source-ref"
        />
        <input
          class="rmp__form-input"
          type="text"
          placeholder="name (optional)"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          data-testid="blueprint-source-name"
        />
        <button
          type="submit"
          class="rmp__form-add"
          disabled={busy() || !source().trim()}
          data-testid="blueprint-source-add"
        >
          <Icon name="plus" size={12} />
          <span>{busy() ? 'Adding…' : 'Add source'}</span>
        </button>
      </form>
      <Show when={error()}>
        <p class="rmp__form-err" data-testid="blueprint-source-error">
          {error()}
        </p>
      </Show>
    </section>
  );
}

/** Expert packs (#344 / #376 / #377). Read + validate. */
export function ExpertPacksPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.expertPacks().catch(() => ({ packs: [] })),
  );
  const items = () => data()?.packs ?? [];

  const [validateOpen, setValidateOpen] = createSignal(false);
  const [pathText, setPathText] = createSignal('');
  const [scope, setScope] = createSignal<'workspace' | 'global' | 'session'>('session');
  const [busy, setBusy] = createSignal(false);
  const [verdict, setVerdict] = createSignal<{ ok: boolean; errors?: string[] } | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function submitValidate(ev: SubmitEvent) {
    ev.preventDefault();
    setError(null);
    setVerdict(null);
    const path = pathText().trim();
    if (!path) {
      setError('Enter the expert-pack path on the clio host.');
      return;
    }
    setBusy(true);
    try {
      const v = await props.client.validateExpertPack({ path, scope: scope() });
      setVerdict(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DiscoveryPage
      icon="sparkle"
      title="Expert packs"
      subtitle="Hierarchical prompt + skill bundles that bind to a workspace, session, or single turn."
      actions={
        <>
          <button
            type="button"
            class="dp-iconbtn"
            onClick={() => setValidateOpen((v) => !v)}
            title="Validate a pack JSON"
            data-testid="expertpack-validate-toggle"
          >
            <Icon name="check" size={14} />
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
      empty={!data.loading && items().length === 0 && !validateOpen()}
      emptyTitle="No expert packs installed"
      emptyBody="Drop a pack under clio-agent/src/clio_agent/experts/ then validate it by path above."
    >
      <Show when={validateOpen()}>
        <form class="rmp__install" onSubmit={submitValidate}>
          <label class="rmp__install-label" for="ep-validate">
            Expert pack path (on the clio host)
          </label>
          <input
            id="ep-validate"
            class="rmp__editor"
            type="text"
            placeholder="src/clio_agent/experts/my-pack"
            value={pathText()}
            onInput={(e) => setPathText(e.currentTarget.value)}
            data-testid="expertpack-validate-input"
          />
          <label class="rmp__install-label" for="ep-scope">
            Scope
          </label>
          <select
            id="ep-scope"
            class="rmp__editor"
            value={scope()}
            onChange={(e) =>
              setScope(e.currentTarget.value as 'workspace' | 'global' | 'session')
            }
            data-testid="expertpack-validate-scope"
          >
            <option value="session">session</option>
            <option value="workspace">workspace</option>
            <option value="global">global</option>
          </select>
          <Show when={error()}>
            <p class="rmp__form-err">{error()}</p>
          </Show>
          <Show when={verdict()}>
            <p
              class={'rmp__form-err ' + (verdict()!.ok ? 'rmp__form-ok' : '')}
              data-testid="expertpack-verdict"
            >
              <Show
                when={verdict()!.ok}
                fallback={`✗ ${(verdict()!.errors ?? []).join('; ') || 'invalid'}`}
              >
                ✓ Pack JSON looks valid.
              </Show>
            </p>
          </Show>
          <div class="rmp__editor-actions">
            <button
              type="button"
              class="ws-form__btn"
              onClick={() => setValidateOpen(false)}
              disabled={busy()}
            >
              Close
            </button>
            <button
              type="submit"
              class="ws-form__btn ws-form__btn--primary"
              disabled={busy() || !pathText().trim()}
              data-testid="expertpack-validate-submit"
            >
              {busy() ? 'Validating…' : 'Validate'}
            </button>
          </div>
        </form>
      </Show>
      <div class="dp__grid">
        <For each={items()}>
          {(p) => (
            <article class="dp__card" data-testid={`expertpack-${p.id}`}>
              <header class="dp__card-head">
                <div class="dp__card-title-row">
                  <div class="dp__card-icon">
                    <Icon name="sparkle" size={14} />
                  </div>
                  <div style="min-width:0">
                    <h3 class="dp__card-title">{p.name ?? p.id}</h3>
                    <div class="dp__card-sub">{p.id}</div>
                  </div>
                </div>
                <Show when={p.runtime_scope}>
                  <span class="dp__tag">{p.runtime_scope}</span>
                </Show>
              </header>
              <Show when={p.description}>
                <p class="dp__card-body">{p.description}</p>
              </Show>
            </article>
          )}
        </For>
      </div>
    </DiscoveryPage>
  );
}
