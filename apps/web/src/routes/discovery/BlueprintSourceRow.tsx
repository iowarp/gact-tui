/**
 * Discovery surface: Blueprint Source Row component. Key export `BlueprintSourceRow`.
 */
import { Show } from 'solid-js';
import type { BlueprintSource } from '@clio/core';
import { Icon } from '../../components/Icon.js';
import {
  blueprintSourceDotClass,
  blueprintSourceName,
  blueprintSourceStatus,
} from './BlueprintSourcesPanelModel.js';

export function BlueprintSourceRow(props: {
  source: BlueprintSource;
  refreshing: boolean;
  onRefresh: (id: string) => void | Promise<void>;
  onRemove: (source: BlueprintSource) => void | Promise<void>;
}) {
  const name = () => blueprintSourceName(props.source);
  const status = () => blueprintSourceStatus(props.source);

  return (
    <li class="rmp__row" data-testid={`blueprint-source-row-${props.source.id}`}>
      <span
        class={blueprintSourceDotClass(props.source.status)}
        title={props.source.status_message || props.source.status}
        aria-label={`status: ${props.source.status}`}
      />
      <span class={'rmp__tag bps__status bps__status--' + status()}>{status()}</span>
      <span class="rmp__name">{name()}</span>
      <code class="rmp__uri" title={props.source.source}>
        {props.source.source}
        <Show when={props.source.ref}>
          {' '}
          <span class="bps__ref">@{props.source.ref}</span>
        </Show>
      </code>
      <Show when={props.source.status_message}>
        <span class="bps__msg" title={props.source.status_message}>
          {props.source.status_message}
        </span>
      </Show>
      <button
        type="button"
        class="bps__btn"
        title="Refresh source"
        aria-label={`Refresh source ${name()}`}
        disabled={props.refreshing}
        onClick={() => void props.onRefresh(props.source.id)}
        data-testid={`blueprint-source-refresh-${props.source.id}`}
      >
        <Icon name="regenerate" size={12} />
      </button>
      <button
        type="button"
        class="rmp__row-x"
        title="Remove source"
        aria-label={`Remove source ${name()}`}
        onClick={() => void props.onRemove(props.source)}
        data-testid={`blueprint-source-remove-${props.source.id}`}
      >
        <Icon name="close" size={10} />
      </button>
    </li>
  );
}
