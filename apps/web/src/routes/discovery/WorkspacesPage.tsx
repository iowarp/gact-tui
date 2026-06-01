import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client, Workspace } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { useToast } from '../../components/Toast.js';

export interface WorkspacesPageProps {
  client: Client;
}

export function WorkspacesPage(props: WorkspacesPageProps) {
  const [data, { refetch }] = createResource(() => props.client.workspaces());
  const [query, setQuery] = createSignal('');
  const all = () => data()?.workspaces ?? [];
  const items = () => {
    const q = query().trim().toLowerCase();
    if (!q) return all();
    return all().filter(
      (w) =>
        w.id.toLowerCase().includes(q) ||
        w.name.toLowerCase().includes(q) ||
        w.root_path.toLowerCase().includes(q),
    );
  };
  const [showForm, setShowForm] = createSignal(false);
  const [name, setName] = createSignal('');
  const [rootPath, setRootPath] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const toast = useToast();

  async function submit(e: Event) {
    e.preventDefault();
    if (!rootPath().trim()) {
      toast.push({
        tone: 'warn',
        title: 'Root path required',
        body: 'A workspace needs an absolute root path on the backend host.',
      });
      return;
    }
    setSubmitting(true);
    try {
      const created = await props.client.createWorkspace({
        root_path: rootPath().trim(),
        ...(name().trim() ? { name: name().trim() } : {}),
      });
      toast.push({
        tone: 'success',
        title: 'Workspace created',
        body: created.name ?? created.id,
      });
      setName('');
      setRootPath('');
      setShowForm(false);
      void refetch();
    } catch (err) {
      toast.push({
        tone: 'error',
        title: 'Create failed',
        body: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DiscoveryPage
      icon="workspaces"
      title="Workspaces"
      subtitle="The roots CLIO is allowed to read/write into for this backend."
      actions={
        <>
          <button
            type="button"
            class="dp-iconbtn"
            onClick={() => setShowForm((v) => !v)}
            title={showForm() ? 'Close form' : 'New workspace'}
            data-testid="workspaces-new"
          >
            <Icon name={showForm() ? 'close' : 'plus'} size={14} />
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
      empty={!data.loading && items().length === 0 && !showForm()}
      emptyTitle="No workspaces registered"
      emptyBody="Click + above to add one — CLIO needs a root path before it can read or write files."
    >
      <Show when={showForm()}>
        <form
          class="ws-form"
          onSubmit={submit}
          data-testid="workspaces-form"
        >
          <label class="ws-form__row">
            <span class="ws-form__label">Root path</span>
            <input
              class="ws-form__input"
              type="text"
              value={rootPath()}
              onInput={(e) => setRootPath(e.currentTarget.value)}
              placeholder="/Users/jane/projects/llm-eval"
              autofocus
              data-testid="workspaces-root-input"
            />
          </label>
          <label class="ws-form__row">
            <span class="ws-form__label">Display name (optional)</span>
            <input
              class="ws-form__input"
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="llm-eval"
              data-testid="workspaces-name-input"
            />
          </label>
          <div class="ws-form__actions">
            <button
              type="button"
              class="ws-form__btn"
              onClick={() => setShowForm(false)}
              disabled={submitting()}
            >
              Cancel
            </button>
            <button
              type="submit"
              class="ws-form__btn ws-form__btn--primary"
              disabled={submitting() || !rootPath().trim()}
              data-testid="workspaces-submit"
            >
              {submitting() ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
        </form>
      </Show>
      <Show when={all().length > 4}>
        <div class="dp__search-row">
          <Icon name="search" size={14} class="dp__search-icon" />
          <input
            type="text"
            class="dp__search-input"
            placeholder="Filter workspaces by name, id, or root path…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            data-testid="workspaces-search"
          />
        </div>
      </Show>
      <div class="dp__grid">
        <For each={items()}>
          {(w) => (
            <WorkspaceCard
              ws={w}
              client={props.client}
              onRename={async (next) => {
                try {
                  await props.client.patchWorkspace(w.id, { name: next });
                  toast.push({
                    tone: 'success',
                    title: 'Workspace renamed',
                    body: next,
                    duration: 2400,
                  });
                  void refetch();
                } catch (e) {
                  toast.push({
                    tone: 'error',
                    title: 'Rename failed',
                    body: e instanceof Error ? e.message : String(e),
                  });
                }
              }}
              onDelete={async () => {
                if (
                  !confirm(
                    `Unregister workspace "${w.name}"? Backend keeps on-disk files; only metadata is dropped.`,
                  )
                )
                  return;
                try {
                  await props.client.deleteWorkspace(w.id);
                  toast.push({
                    tone: 'success',
                    title: 'Workspace unregistered',
                    body: w.name,
                    duration: 2400,
                  });
                  void refetch();
                } catch (e) {
                  toast.push({
                    tone: 'error',
                    title: 'Delete failed',
                    body: e instanceof Error ? e.message : String(e),
                  });
                }
              }}
            />
          )}
        </For>
      </div>
    </DiscoveryPage>
  );
}

function WorkspaceCard(props: {
  ws: Workspace;
  client: Client;
  onDelete?: () => void | Promise<void>;
  onRename?: (next: string) => void | Promise<void>;
}) {
  const [showRepo, setShowRepo] = createSignal(false);
  const [repoData, setRepoData] = createSignal<{
    tree?: Record<string, unknown>;
    tokens?: number;
  } | null>(null);
  const [repoLoading, setRepoLoading] = createSignal(false);
  const [repoErr, setRepoErr] = createSignal<string | null>(null);

  async function loadRepo() {
    if (repoData() || repoLoading()) return;
    setRepoLoading(true);
    setRepoErr(null);
    try {
      const d = await props.client.workspaceRepoMap(props.ws.id);
      setRepoData(d);
    } catch (e) {
      setRepoErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRepoLoading(false);
    }
  }

  function toggleRepo() {
    const next = !showRepo();
    setShowRepo(next);
    if (next) void loadRepo();
  }

  return (
    <article class="dp__card" data-testid={`workspace-card-${props.ws.id}`}>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="workspaces" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.ws.name}</h3>
            <div class="dp__card-sub">{props.ws.id}</div>
          </div>
        </div>
      </header>
      <dl class="dp__card-kv">
        <dt>root</dt>
        <dd title={props.ws.root_path}>{props.ws.root_path}</dd>
        <Show
          when={
            (props.ws as Workspace & { created_at?: string }).created_at
          }
        >
          <dt>created</dt>
          <dd>
            {humanDate(
              (props.ws as Workspace & { created_at?: string }).created_at!,
            )}
          </dd>
        </Show>
      </dl>
      <button
        type="button"
        class="ws-card__repo-toggle"
        onClick={toggleRepo}
        data-testid={`workspace-repo-toggle-${props.ws.id}`}
      >
        <Icon
          name="chevron-right"
          size={11}
          class={'ws-card__repo-chev ' + (showRepo() ? 'is-open' : '')}
        />
        <span>
          {showRepo() ? 'Hide' : 'Show'} repo map
          <Show when={repoData()?.tokens}>{` · ${repoData()!.tokens}t`}</Show>
        </span>
      </button>
      <Show when={props.onDelete || props.onRename}>
        <div class="dp__card-actions">
          <Show when={props.onRename}>
            <button
              type="button"
              class="dp__card-btn"
              onClick={async () => {
                const next = window.prompt('New workspace name', props.ws.name);
                if (next && next !== props.ws.name) {
                  await props.onRename?.(next);
                }
              }}
              data-testid={`workspace-rename-${props.ws.id}`}
            >
              Rename
            </button>
          </Show>
          <Show when={props.onDelete}>
            <button
              type="button"
              class="dp__card-btn dp__card-btn--danger"
              onClick={() => void props.onDelete?.()}
              data-testid={`workspace-delete-${props.ws.id}`}
            >
              Unregister
            </button>
          </Show>
        </div>
      </Show>
      <Show when={showRepo()}>
        <div class="ws-card__repo">
          <Show when={repoLoading()}>
            <div class="ws-card__repo-status">Loading repo map…</div>
          </Show>
          <Show when={repoErr()}>
            <div class="ws-card__repo-err">{repoErr()}</div>
          </Show>
          <Show when={repoData()?.tree}>
            <pre class="ws-card__repo-tree">
              {JSON.stringify(repoData()!.tree, null, 2)}
            </pre>
          </Show>
          <Show when={!repoLoading() && !repoErr() && !repoData()?.tree}>
            <div class="ws-card__repo-status">No repo map returned.</div>
          </Show>
        </div>
      </Show>
    </article>
  );
}

function humanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
