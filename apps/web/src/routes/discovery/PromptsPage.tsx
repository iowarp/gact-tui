import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client, PromptDef, PromptSource } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { useToast } from '../../components/Toast.js';

export interface PromptsPageProps {
  client: Client;
}

/**
 * Browser for the `/v1/prompts` registry that landed in clio-agent
 * develop PRs #376/#377 (prompt + expert pack runtimes). Lists every
 * prompt definition with its scope, source path, and validation
 * errors, and exposes a one-click "Reload" to refresh the on-disk
 * source set.
 */
export function PromptsPage(props: PromptsPageProps) {
  const [data, { refetch }] = createResource(() => props.client.prompts());
  const [reloading, setReloading] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const toast = useToast();

  const all = () => data()?.prompts ?? [];
  const items = () => {
    const q = query().trim().toLowerCase();
    if (!q) return all();
    return all().filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        (p.title ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.scope ?? '').toLowerCase().includes(q),
    );
  };
  const sources = () => data()?.sources ?? [];

  async function reload() {
    setReloading(true);
    try {
      await props.client.reloadPrompts();
      toast.push({
        tone: 'success',
        title: 'Prompts reloaded',
        duration: 2200,
      });
      void refetch();
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Reload failed',
        body: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setReloading(false);
    }
  }

  return (
    <DiscoveryPage
      icon="sparkle"
      title="Prompts"
      subtitle="Built-in and user-defined prompt definitions registered with this backend."
      actions={
        <>
          <button
            type="button"
            class="dp-iconbtn"
            onClick={reload}
            disabled={reloading()}
            title="Reload prompts from disk"
            data-testid="prompts-reload"
          >
            <Icon name="regenerate" size={14} />
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
      // Only show the skeleton on the first load — a Save-triggered refetch
      // keeps the stale list (and the open card + its save result) visible
      // instead of flashing the skeleton and collapsing the editor.
      loading={data.loading && data() == null}
      error={data.error ? String((data.error as Error).message ?? data.error) : null}
      onRetry={() => void refetch()}
      empty={!data.loading && items().length === 0}
      emptyTitle="No prompts registered"
      emptyBody="Backend doesn't expose /v1/prompts or no prompt sources are mounted."
    >
      <Show when={sources().length > 0}>
        <div class="dp__section-title">Sources</div>
        <ul class="prompts__sources" data-testid="prompts-sources">
          <For each={sources()}>
            {(s) => <PromptSourceRow source={s} />}
          </For>
        </ul>
      </Show>
      <Show when={all().length > 6}>
        <div class="dp__search-row">
          <Icon name="search" size={14} class="dp__search-icon" />
          <input
            type="text"
            class="dp__search-input"
            placeholder="Filter prompts by id, title, description, or scope…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            data-testid="prompts-search"
          />
        </div>
      </Show>
      <div class="dp__section-title">Prompts ({items().length})</div>
      <div class="dp__grid">
        <For each={items()}>
          {(p) => <PromptCard p={p} client={props.client} onSaved={refetch} />}
        </For>
      </div>
    </DiscoveryPage>
  );
}

function PromptSourceRow(props: { source: PromptSource }) {
  return (
    <li class="prompts__source" data-testid={`prompts-source-${props.source.scope}`}>
      <span class={'prompts__scope prompts__scope--' + props.source.scope}>
        {props.source.scope}
      </span>
      <span class="prompts__source-root">{props.source.root}</span>
    </li>
  );
}

function PromptCard(props: { p: PromptDef; client?: Client; onSaved?: () => void }) {
  const profileCount = () => {
    const profiles = props.p.profiles;
    if (!profiles) return 0;
    return Object.keys(profiles).length;
  };
  const hasErrors = () => (props.p.validation_errors ?? []).length > 0;
  const [open, setOpen] = createSignal(false);
  const [preview, setPreview] = createSignal<string | null>(null);
  const [previewError, setPreviewError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  // A4 — editable draft + save flow. `draft` is seeded from the loaded
  // prompt text and is what Validate/Save operate on.
  const [draft, setDraft] = createSignal('');
  const [scope, setScope] = createSignal<'global' | 'workspace' | 'session'>('global');
  const [saving, setSaving] = createSignal(false);
  const [validating, setValidating] = createSignal(false);
  // Result of the last Validate or Save: tone drives the colour, msg the text.
  const [result, setResult] = createSignal<{ ok: boolean; msg: string } | null>(null);
  const toast = useToast();

  async function loadPreview() {
    if (preview() != null || loading()) return;
    setLoading(true);
    setPreviewError(null);
    try {
      if (!props.client) throw new Error('No client');
      const res = await props.client.getPrompt(props.p.id);
      const text = res.prompt.text ?? '';
      setPreview(text);
      setDraft(text);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function validate() {
    if (!props.client || validating()) return;
    setValidating(true);
    setResult(null);
    try {
      const res = await props.client.validatePrompt(props.p.id, { text: draft() });
      const errs = res.validation_errors ?? [];
      setResult(
        errs.length === 0
          ? { ok: true, msg: 'Prompt text is valid.' }
          : { ok: false, msg: errs.join('; ') },
      );
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setValidating(false);
    }
  }

  async function save() {
    if (!props.client || saving()) return;
    setSaving(true);
    setResult(null);
    try {
      await props.client.savePrompt(props.p.id, { text: draft(), scope: scope() });
      setResult({ ok: true, msg: `Saved (${scope()}).` });
      toast.push({ tone: 'success', title: 'Prompt saved', duration: 2200 });
      props.onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, msg });
    } finally {
      setSaving(false);
    }
  }

  function toggle() {
    const next = !open();
    setOpen(next);
    if (next) void loadPreview();
  }
  return (
    <article
      class={
        'dp__card ' +
        (hasErrors() ? 'dp__card--err ' : '') +
        (open() ? 'dp__card--open' : '')
      }
      data-testid={`prompt-card-${props.p.id}`}
      onClick={toggle}
      style={props.client ? 'cursor: pointer' : ''}
    >
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="sparkle" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.p.title || props.p.id}</h3>
            <div class="dp__card-sub">{props.p.id}</div>
          </div>
        </div>
        <Show when={props.p.scope}>
          <span class={'dp__tag prompts__scope--' + props.p.scope}>
            {props.p.scope}
          </span>
        </Show>
      </header>
      <Show when={props.p.description}>
        <p class="dp__card-body">{props.p.description}</p>
      </Show>
      <dl class="dp__card-kv">
        <Show when={props.p.default_profile}>
          <dt>default</dt>
          <dd>{props.p.default_profile}</dd>
        </Show>
        <Show when={profileCount() > 0}>
          <dt>profiles</dt>
          <dd>{profileCount()}</dd>
        </Show>
        <Show when={props.p.source_path}>
          <dt>source</dt>
          <dd title={props.p.source_path}>{props.p.source_path}</dd>
        </Show>
        <Show when={props.p.enabled === false}>
          <dt>state</dt>
          <dd>
            <span class="dp__tag dp__tag--warn">disabled</span>
          </dd>
        </Show>
      </dl>
      <Show when={hasErrors()}>
        <div class="prompts__errors" data-testid={`prompt-errors-${props.p.id}`}>
          <Icon name="alert" size={12} />
          <span>
            {props.p.validation_errors!.length} validation error
            {props.p.validation_errors!.length === 1 ? '' : 's'}
          </span>
          <ul class="prompts__errors-list">
            <For each={props.p.validation_errors!.slice(0, 3)}>
              {(err) => <li>{err}</li>}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={open()}>
        <div class="prompts__preview" onClick={(e) => e.stopPropagation()}>
          <div class="prompts__preview-label">
            Default profile{' '}
            <Show when={props.p.default_profile}>
              <span>(<code>{props.p.default_profile}</code>)</span>
            </Show>
          </div>
          <Show when={loading()}>
            <div class="prompts__preview-loading">Loading…</div>
          </Show>
          <Show when={previewError()}>
            <div class="prompts__preview-error">{previewError()}</div>
          </Show>
          <Show when={preview() != null && !loading() && !previewError()}>
            <Show
              when={props.client}
              fallback={<pre class="prompts__preview-body">{preview()}</pre>}
            >
              <textarea
                class="rmp__editor prompts__edit"
                value={draft()}
                onInput={(e) => setDraft(e.currentTarget.value)}
                rows={14}
                data-testid="prompt-edit-text"
              />
              <div class="prompts__edit-actions">
                <select
                  class="rmp__form-select"
                  value={scope()}
                  onChange={(e) =>
                    setScope(e.currentTarget.value as 'global' | 'workspace' | 'session')
                  }
                  data-testid="prompt-save-scope"
                >
                  <option value="global">global</option>
                  <option value="workspace">workspace</option>
                  <option value="session">session</option>
                </select>
                <button
                  type="button"
                  class="ws-form__btn"
                  onClick={() => void validate()}
                  disabled={validating() || saving()}
                  data-testid="prompt-validate"
                >
                  {validating() ? 'Validating…' : 'Validate'}
                </button>
                <button
                  type="button"
                  class="ws-form__btn ws-form__btn--primary"
                  onClick={() => void save()}
                  disabled={saving() || validating()}
                  data-testid="prompt-save"
                >
                  {saving() ? 'Saving…' : 'Save'}
                </button>
              </div>
              <Show when={result()}>
                <p
                  class={'rmp__form-err ' + (result()!.ok ? 'rmp__form-ok' : '')}
                  data-testid="prompt-save-result"
                >
                  {result()!.ok ? '✓ ' : '✗ '}
                  {result()!.msg}
                </p>
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
    </article>
  );
}
