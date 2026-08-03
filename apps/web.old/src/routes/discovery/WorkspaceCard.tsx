/**
 * Discovery surface: Workspace Card component. Key export `WorkspaceCard`.
 */
import { createSignal, Show } from 'solid-js';
import type { Client, Workspace } from '@clio/core';
import { Icon } from '../../components/Icon.js';
import {
  humanWorkspaceDate,
  workspaceCreatedAt,
  workspaceRepoTokenLabel,
  workspaceRepoTreeText,
} from './WorkspaceCardModel.js';

export function WorkspaceCard(props: {
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
        <Show when={workspaceCreatedAt(props.ws)}>
          <dt>created</dt>
          <dd>
            {humanWorkspaceDate(workspaceCreatedAt(props.ws)!)}
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
          <Show when={workspaceRepoTokenLabel(repoData()?.tokens)}>
            {(label) => ` · ${label()}`}
          </Show>
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
              {workspaceRepoTreeText(repoData()!.tree)}
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
