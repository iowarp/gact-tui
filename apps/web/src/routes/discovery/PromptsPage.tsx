/**
 * Discovery surface: Prompts Page component. Key export `PromptsPageProps`.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client, PromptSource } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { useToast } from '../../components/Toast.js';
import { PromptCard } from './PromptCard.js';
import { filterPrompts } from './PromptsPageModel.js';
import { scopeRequest, type PromptScopeContext } from './PromptScope.js';
import './roadmap-page.css';
import './discovery-prompts.css';

export interface PromptsPageProps {
  client: Client;
  context?: PromptScopeContext;
}

/**
 * Browser for the `/v1/prompts` registry that landed in clio-agent
 * develop PRs #376/#377 (prompt + expert pack runtimes). Lists every
 * prompt definition with its scope, source path, and validation
 * errors, and exposes a one-click "Reload" to refresh the on-disk
 * source set.
 */
export function PromptsPage(props: PromptsPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.prompts(scopeRequest(props.context)),
  );
  const [reloading, setReloading] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const toast = useToast();

  const all = () => data()?.prompts ?? [];
  const items = () => filterPrompts(all(), query());
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
      subtitle="Reusable instructions available to sessions on this backend."
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
          {(p) => (
            <PromptCard
              p={p}
              client={props.client}
              context={props.context}
              onSaved={refetch}
            />
          )}
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
