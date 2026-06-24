/**
 * Discovery surface: Plugin Card component. Key export `PluginCard`.
 */
import { Show } from 'solid-js';
import type { PluginDef } from '../../plugins.js';
import { Icon } from '../../components/Icon.js';

export function PluginCard(props: {
  def: PluginDef;
  canRun: boolean;
  desktopName: string;
  onRun: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <article class="dp__card" data-testid={`plugin-card-${props.def.id}`}>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="tool" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.def.name}</h3>
            <Show when={props.def.trigger}>
              <div class="dp__card-sub">{props.def.trigger}</div>
            </Show>
          </div>
        </div>
      </header>
      <dl class="dp__card-kv">
        <dt>path</dt>
        <dd title={props.def.path}>{props.def.path}</dd>
        <Show when={props.def.args.length > 0}>
          <dt>args</dt>
          <dd>{props.def.args.join(' ')}</dd>
        </Show>
        <Show when={props.def.description}>
          <dt>desc</dt>
          <dd>{props.def.description}</dd>
        </Show>
        <Show when={props.def.timeoutMs}>
          <dt>timeout</dt>
          <dd>{props.def.timeoutMs}ms</dd>
        </Show>
      </dl>
      <div class="dp__card-actions">
        <button
          type="button"
          class="dp__card-btn"
          onClick={props.onRun}
          disabled={!props.canRun}
          title={
            props.canRun
              ? 'Execute now'
              : `Pure-web build can't exec — open in ${props.desktopName} Desktop`
          }
          data-testid={`plugin-run-${props.def.id}`}
        >
          Run
        </button>
        <button
          type="button"
          class="dp__card-btn"
          onClick={props.onEdit}
          data-testid={`plugin-edit-${props.def.id}`}
        >
          Edit
        </button>
        <button
          type="button"
          class="dp__card-btn dp__card-btn--danger"
          onClick={props.onRemove}
          data-testid={`plugin-remove-${props.def.id}`}
        >
          Remove
        </button>
      </div>
    </article>
  );
}
