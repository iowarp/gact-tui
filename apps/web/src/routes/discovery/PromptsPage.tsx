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
  const toast = useToast();

  const items = () => data()?.prompts ?? [];
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
      loading={data.loading}
      error={data.error ? String((data.error as Error).message ?? data.error) : null}
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
      <div class="dp__section-title">Prompts ({items().length})</div>
      <div class="dp__grid">
        <For each={items()}>{(p) => <PromptCard p={p} />}</For>
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

function PromptCard(props: { p: PromptDef }) {
  const profileCount = () => {
    const profiles = props.p.profiles;
    if (!profiles) return 0;
    return Object.keys(profiles).length;
  };
  const hasErrors = () => (props.p.validation_errors ?? []).length > 0;
  return (
    <article
      class={'dp__card ' + (hasErrors() ? 'dp__card--err' : '')}
      data-testid={`prompt-card-${props.p.id}`}
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
    </article>
  );
}
