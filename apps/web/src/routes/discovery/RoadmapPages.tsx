/**
 * Read-only discovery pages for the GACT v0.2 surfaces the desktop
 * doesn't yet have a write-flow for: hooks, policies, agent
 * blueprints, expert packs. Surfacing them in Settings makes them
 * discoverable (instead of users having to edit YAML on disk and
 * not knowing where to look).
 */

import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface ClientPageProps {
  client: Client;
}

/** Hooks: pre/post-message + pre/post-tool handlers. Read + add + delete. */
export function HooksPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.hooks().catch(() => ({ hooks: [] })),
  );
  const items = () => data()?.hooks ?? [];

  const [hType, setHType] = createSignal<'pre_message' | 'post_message' | 'pre_tool' | 'post_tool'>(
    'pre_message',
  );
  const [hUri, setHUri] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function submitNew(ev: SubmitEvent) {
    ev.preventDefault();
    const uri = hUri().trim();
    if (!uri || busy()) return;
    setBusy(true);
    setError(null);
    try {
      await props.client.createHook({ type: hType(), handler_uri: uri });
      setHUri('');
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
      subtitle="Registered pre / post handlers for messages and tools. Add an HTTP URI and the backend will POST every turn payload to it."
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
      <Show when={!data.loading && items().length === 0 && !error()}>
        <div
          class="dp__empty"
          data-testid="hooks-empty-hint"
          style="padding-block: 16px"
        >
          <div class="dp__empty-icon">
            <Icon name="tool" size={28} />
          </div>
          <h2 class="dp__empty-title">No hooks registered</h2>
          <p class="dp__empty-body">
            Hooks are external HTTP / stdio handlers the backend POSTs to on every turn. Add one below.
          </p>
        </div>
      </Show>
      <ul class="rmp__list" data-testid="hooks-list">
        <For each={items()}>
          {(h) => (
            <li class="rmp__row" data-testid={`hook-${h.id}`}>
              <span class={'rmp__tag rmp__tag--' + h.type}>{h.type}</span>
              <span class="rmp__name">{h.id}</span>
              <code class="rmp__uri">{h.handler_uri}</code>
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
      <form class="rmp__form" onSubmit={submitNew} data-testid="hook-form">
        <select
          class="rmp__form-select"
          value={hType()}
          onChange={(e) =>
            setHType(
              e.currentTarget.value as
                | 'pre_message'
                | 'post_message'
                | 'pre_tool'
                | 'post_tool',
            )
          }
          data-testid="hook-type"
        >
          <option value="pre_message">pre_message</option>
          <option value="post_message">post_message</option>
          <option value="pre_tool">pre_tool</option>
          <option value="post_tool">post_tool</option>
        </select>
        <input
          class="rmp__form-input"
          type="url"
          placeholder="http://localhost:9999/hook"
          value={hUri()}
          onInput={(e) => setHUri(e.currentTarget.value)}
          data-testid="hook-uri"
        />
        <button
          type="submit"
          class="rmp__form-add"
          disabled={busy() || !hUri().trim()}
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
      empty={!data.loading && items().length === 0 && !installOpen()}
      emptyTitle="No blueprints registered"
      emptyBody="Install one by path (on the clio host) or a git URL via the + button."
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
