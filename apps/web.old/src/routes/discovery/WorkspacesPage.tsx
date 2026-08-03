/**
 * Discovery surface: Workspaces Page component. Key export `WorkspacesPageProps`.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import { brand } from '@brand';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { useToast } from '../../components/Toast.js';
import { WorkspaceCard } from './WorkspaceCard.js';
import {
  buildCreateWorkspaceInput,
  createdWorkspaceToastBody,
  filterWorkspaces,
  unregisterWorkspacePrompt,
} from './WorkspacesPageModel.js';
import {
  WorkspaceAddCard,
  WorkspaceCreateForm,
  WorkspaceSearchRow,
} from './WorkspaceSections.js';

export interface WorkspacesPageProps {
  client: Client;
}

export function WorkspacesPage(props: WorkspacesPageProps) {
  const [data, { refetch }] = createResource(() => props.client.workspaces());
  const [query, setQuery] = createSignal('');
  const all = () => data()?.workspaces ?? [];
  const items = () => filterWorkspaces(all(), query());
  const [showForm, setShowForm] = createSignal(false);
  const [name, setName] = createSignal('');
  const [rootPath, setRootPath] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const toast = useToast();

  async function submit(e: Event) {
    e.preventDefault();
    const body = buildCreateWorkspaceInput(rootPath(), name());
    if (!body) {
      toast.push({
        tone: 'warn',
        title: 'Root path required',
        body: 'A workspace needs an absolute root path on the backend host.',
      });
      return;
    }
    setSubmitting(true);
    try {
      const created = await props.client.createWorkspace(body);
      toast.push({
        tone: 'success',
        title: 'Workspace created',
        body: createdWorkspaceToastBody(created),
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
      subtitle={`The roots ${brand.name} is allowed to read/write into for this backend.`}
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
      emptyBody={`Click + above to add one — ${brand.name} needs a root path before it can read or write files.`}
    >
      <Show when={showForm()}>
        <WorkspaceCreateForm
          rootPath={rootPath()}
          name={name()}
          submitting={submitting()}
          onRootPath={setRootPath}
          onName={setName}
          onCancel={() => setShowForm(false)}
          onSubmit={submit}
        />
      </Show>
      <Show when={all().length > 4}>
        <WorkspaceSearchRow query={query()} onQuery={setQuery} />
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
                if (!confirm(unregisterWorkspacePrompt(w.name))) return;
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
        {/* Inviting ghost "+ Add" card so a sparse list never reads as an
            empty void — it sits in the grid as a peer of the real cards and
            opens the create form. */}
        <Show when={!showForm()}>
          <WorkspaceAddCard brandName={brand.name} onClick={() => setShowForm(true)} />
        </Show>
      </div>
    </DiscoveryPage>
  );
}
