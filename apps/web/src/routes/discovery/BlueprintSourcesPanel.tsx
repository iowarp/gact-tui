/**
 * Discovery surface: Blueprint Sources Panel component. Key export `BlueprintSourcesPanel`.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import { brand } from '@brand';
import type { BlueprintSource } from '@clio/core';
import { runAsyncAction } from '../../asyncAction.js';
import { Icon } from '../../components/Icon.js';
import type { ClientPageProps } from './RoadmapTypes.js';
import { buildAddBlueprintSourceInput } from './BlueprintSourcesPanelModel.js';
import { BlueprintSourceRow } from './BlueprintSourceRow.js';

/**
 * Agent blueprint source management.
 *
 * Sources are the git/local registries clio scans for installable blueprints,
 * distinct from the installed blueprints listed on the host page.
 */
export function BlueprintSourcesPanel(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.blueprintSources().catch(() => ({ sources: [] as BlueprintSource[] })),
  );
  const sources = () => data()?.sources ?? [];

  const [source, setSource] = createSignal('');
  const [ref, setRef] = createSignal('');
  const [name, setName] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [refreshing, setRefreshing] = createSignal<Record<string, boolean>>({});

  async function runSourceAction(action: () => Promise<void>) {
    await runAsyncAction(action, {
      setError,
      afterSuccess: () => void refetch(),
    });
  }

  async function submitAdd(ev: SubmitEvent) {
    ev.preventDefault();
    setError(null);
    const src = source().trim();
    if (!src) {
      setError('Enter a git URL or local path for the source.');
      return;
    }
    const body = buildAddBlueprintSourceInput(src, ref(), name());
    if (!body) return;
    setBusy(true);
    try {
      await runSourceAction(async () => {
        await props.client.addBlueprintSource(body);
        setSource('');
        setRef('');
        setName('');
      });
    } finally {
      setBusy(false);
    }
  }

  async function refresh(id: string) {
    setRefreshing((m) => ({ ...m, [id]: true }));
    try {
      await runSourceAction(async () => {
        await props.client.refreshBlueprintSource(id);
      });
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
    await runSourceAction(async () => {
      await props.client.deleteBlueprintSource(s.id);
    });
  }

  return (
    <section class="rmp__panel" data-testid="blueprint-sources-panel">
      <header class="rmp__panel-head">
        <h2 class="rmp__panel-title">Sources</h2>
        <span class="rmp__panel-note">
          git / local registries the backend scans for installable blueprints
        </span>
      </header>

      <Show
        when={!data.loading && sources().length === 0}
        fallback={
          <ul class="rmp__list" data-testid="blueprint-sources-list">
            <For each={sources()}>
              {(s) => (
                <BlueprintSourceRow
                  source={s}
                  refreshing={!!refreshing()[s.id]}
                  onRefresh={refresh}
                  onRemove={remove}
                />
              )}
            </For>
          </ul>
        }
      >
        <div class="dp__empty" data-testid="blueprint-sources-empty" style="padding-block: 16px">
          <div class="dp__empty-icon">
            <Icon name="branch" size={28} />
          </div>
          <h2 class="dp__empty-title">No blueprint sources registered</h2>
          <p class="dp__empty-body">
            Add a git URL or local path below to point {brand.name} at a registry of installable
            blueprints.
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
