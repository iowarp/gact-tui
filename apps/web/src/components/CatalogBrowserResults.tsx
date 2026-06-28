/**
 * UI component: Catalog Browser Results. Renders `CatalogBrowserResults` from `CatalogBrowserResultsProps`.
 */
import { For, Show } from 'solid-js';
import { Icon } from './Icon.js';
import {
  KIND_ICON,
  KIND_LABEL,
  type CatalogHit,
  type CatalogHitGroup,
} from './CatalogBrowserModel.js';

export interface CatalogBrowserResultsProps {
  groups: CatalogHitGroup[];
  loading: boolean;
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  onPick: (hit: CatalogHit) => void;
}

export function CatalogBrowserResults(props: CatalogBrowserResultsProps) {
  return (
    <ul class="cbr__list" role="listbox">
      <For each={props.groups}>
        {(group) => (
          <>
            <li class="cbr__group-head">
              <Icon name={KIND_ICON[group.kind]} size={11} />
              <span>{KIND_LABEL[group.kind]}</span>
              <span class="cbr__group-count">{group.hits.length}</span>
            </li>
            <For each={group.hits}>
              {({ hit, index }) => (
                <li
                  role="option"
                  aria-selected={index === props.highlightedIndex}
                  class={'cbr__item ' + (index === props.highlightedIndex ? 'is-active' : '')}
                  onMouseEnter={() => props.onHighlight(index)}
                  onClick={() => props.onPick(hit)}
                  data-testid={`catalog-item-${hit.kind}-${hit.id}`}
                >
                  <span class="cbr__item-label">{hit.label}</span>
                  <Show when={hit.detail}>
                    <span class="cbr__item-detail">{hit.detail}</span>
                  </Show>
                  <span class="cbr__item-id">{hit.id}</span>
                </li>
              )}
            </For>
          </>
        )}
      </For>
      <Show when={!props.loading && props.groups.length === 0}>
        <li class="cbr__empty">No catalog entries match.</li>
      </Show>
    </ul>
  );
}
