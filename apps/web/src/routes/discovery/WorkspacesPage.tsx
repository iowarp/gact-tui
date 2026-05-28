import { createResource, For, Show } from 'solid-js';
import type { Client, Workspace } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface WorkspacesPageProps {
  client: Client;
}

export function WorkspacesPage(props: WorkspacesPageProps) {
  const [data, { refetch }] = createResource(() => props.client.workspaces());
  const items = () => data()?.workspaces ?? [];
  return (
    <DiscoveryPage
      icon="workspaces"
      title="Workspaces"
      subtitle="The roots CLIO is allowed to read/write into for this backend."
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
      error={data.error ? String((data.error as Error).message ?? data.error) : null}
      empty={!data.loading && items().length === 0}
      emptyTitle="No workspaces registered"
      emptyBody="Add one via the backend's CLIO_ALLOWED_ROOTS env var or workspace API."
    >
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
