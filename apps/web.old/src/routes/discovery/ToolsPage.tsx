/**
 * Discovery surface: Tools Page component. Key export `ToolsPageProps`.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client, SlashCommandDef } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { useToast } from '../../components/Toast.js';
import {
  commandCopyFailureBody,
  commandCopySuccessBody,
  commandTrigger,
  filterCommands,
} from './ToolsPageModel.js';

export interface ToolsPageProps {
  client: Client;
}

export function ToolsPage(props: ToolsPageProps) {
  const [data, { refetch }] = createResource(() => props.client.commands());
  const [query, setQuery] = createSignal('');
  const all = () => data()?.commands ?? [];
  const items = () => filterCommands(all(), query());
  return (
    <DiscoveryPage
      icon="tools"
      title="Commands"
      subtitle="Slash commands the backend exposes. Trigger them from the composer."
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
      onRetry={() => void refetch()}
      empty={!data.loading && items().length === 0}
      emptyTitle="No commands registered"
      emptyBody="Backend exposes no /v1/commands; the composer's slash palette falls back to defaults."
    >
      <Show when={all().length > 6}>
        <div class="dp__search-row">
          <Icon name="search" size={14} class="dp__search-icon" />
          <input
            type="text"
            class="dp__search-input"
            placeholder="Filter commands…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            data-testid="commands-search"
          />
        </div>
      </Show>
      <div class="dp__grid">
        <For each={items()}>{(c) => <CommandCard c={c} />}</For>
      </div>
    </DiscoveryPage>
  );
}

function CommandCard(props: { c: SlashCommandDef }) {
  const toast = useToast();
  // The slash trigger the user types in the composer to run this command.
  const trigger = () => commandTrigger(props.c.id);

  async function copyTrigger() {
    try {
      await navigator.clipboard.writeText(trigger());
      toast.push({
        tone: 'success',
        title: 'Copied',
        body: commandCopySuccessBody(trigger()),
        duration: 2400,
      });
    } catch {
      toast.push({
        tone: 'warn',
        title: 'Copy failed',
        body: commandCopyFailureBody(trigger()),
      });
    }
  }

  return (
    <article class="dp__card" data-testid={`command-card-${props.c.id}`}>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="tool" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.c.title}</h3>
            <div class="dp__card-sub">{props.c.id}</div>
          </div>
        </div>
        <Show when={props.c.source}>
          <span class="dp__tag">{props.c.source}</span>
        </Show>
      </header>
      <Show when={props.c.description}>
        <p class="dp__card-body">{props.c.description}</p>
      </Show>
      {/* Visible "run" affordance — the card otherwise looks inert despite
          inviting copy. Copies the slash trigger ready to paste/run. */}
      <div class="dp__card-actions">
        <button
          type="button"
          class="dp__card-btn dp__card-btn--primary"
          onClick={() => void copyTrigger()}
          data-testid={`command-copy-${props.c.id}`}
        >
          <Icon name="copy" size={13} />
          Copy {trigger()}
        </button>
      </div>
    </article>
  );
}
