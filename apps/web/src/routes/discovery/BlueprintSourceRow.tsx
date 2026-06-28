/**
 * Discovery surface: Blueprint Source Row component. Key export `BlueprintSourceRow`.
 */
import { For, Show } from 'solid-js';
import type { BlueprintSourceGroup } from './BlueprintSourcesPanelModel.js';
import { Icon } from '../../components/Icon.js';
import {
  blueprintProvenanceSummary,
  blueprintSourceDotClass,
  shortCommit,
} from './BlueprintSourcesPanelModel.js';

export function BlueprintSourceRow(props: {
  group: BlueprintSourceGroup;
  refreshing: boolean;
  onRefresh: (id: string) => void | Promise<void>;
  onInstall: (source: string, ref?: string) => void;
  onRemove: (group: BlueprintSourceGroup) => void | Promise<void>;
}) {
  const group = () => props.group;
  const status = () => group().status || 'unknown';

  return (
    <li class="bps__source-card" data-testid={`blueprint-source-row-${group().id}`}>
      <div class="bps__source-head">
        <span
          class={blueprintSourceDotClass(status())}
          title={group().statusMessage || status()}
          aria-label={`status: ${status()}`}
        />
        <span class={'rmp__tag bps__status bps__status--' + status()}>{status()}</span>
        <div class="bps__source-title">
          <span class="rmp__name">{group().name}</span>
          <code class="rmp__uri" title={group().sourceText}>
            {group().sourceText}
            <Show when={group().ref}>
              {' '}
              <span class="bps__ref">@{group().ref}</span>
            </Show>
          </code>
        </div>
        <Show when={group().commit}>
          <span class="bps__commit" title={group().commit}>
            {shortCommit(group().commit)}
          </span>
        </Show>
        <div class="bps__actions">
          <Show when={group().source}>
            <button
              type="button"
              class="bps__btn"
              title="Refresh source"
              aria-label={`Refresh source ${group().name}`}
              disabled={props.refreshing}
              onClick={() => void props.onRefresh(group().source!.id)}
              data-testid={`blueprint-source-refresh-${group().source!.id}`}
            >
              <Icon name="regenerate" size={12} />
            </button>
          </Show>
          <button
            type="button"
            class="bps__btn bps__btn--primary"
            title="Install or update from this source"
            onClick={() => props.onInstall(group().sourceText, group().ref)}
            data-testid={`blueprint-source-install-${group().id}`}
          >
            <Icon name="plus" size={12} />
            <span>Install</span>
          </button>
          <Show when={group().source}>
            <button
              type="button"
              class="rmp__row-x"
              title="Remove source"
              aria-label={`Remove source ${group().name}`}
              onClick={() => void props.onRemove(group())}
              data-testid={`blueprint-source-remove-${group().source!.id}`}
            >
              <Icon name="close" size={10} />
            </button>
          </Show>
        </div>
      </div>
      <Show when={group().statusMessage}>
        <div class="bps__msg" title={group().statusMessage}>
          {group().statusMessage}
        </div>
      </Show>
      <ul class="bps__nested-list" data-testid={`blueprint-source-blueprints-${group().id}`}>
        <Show
          when={group().blueprints.length > 0}
          fallback={
            <li class="bps__nested-empty">
              No installed blueprints from this source yet. Refresh, then install from this source.
            </li>
          }
        >
          <For each={group().blueprints}>
            {(blueprint) => (
              <li class="bps__nested-row" data-testid={`blueprint-source-child-${blueprint.id}`}>
                <Icon name="agents" size={12} />
                <span class="bps__nested-name">{blueprint.name ?? blueprint.id}</span>
                <span class="bps__nested-id">{blueprint.id}</span>
                <Show when={blueprintProvenanceSummary(blueprint)}>
                  <span class="bps__nested-meta">{blueprintProvenanceSummary(blueprint)}</span>
                </Show>
              </li>
            )}
          </For>
        </Show>
      </ul>
    </li>
  );
}
