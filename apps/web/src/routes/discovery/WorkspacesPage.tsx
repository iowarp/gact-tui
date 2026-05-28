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
  const items = () => data()?.workspaces ?? [];
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
      <div class="dp__grid">
        <For each={items()}>{(w) => <WorkspaceCard ws={w} />}</For>
      </div>
    </DiscoveryPage>
  );
}

function WorkspaceCard(props: { ws: Workspace }) {
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
