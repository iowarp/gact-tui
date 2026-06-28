/**
 * Renders the provenance detail for a session's blueprint/expert bindings.
 * Exports {@link InspectorBindingProvenance}.
 */
import { For, Show } from 'solid-js';
import {
  formatBindingValue,
  hasBindingProvenance,
  type SessionBindings,
} from './InspectorBindingsModel.js';

export function InspectorBindingProvenance(props: { bindings: SessionBindings }) {
  return (
    <Show when={hasBindingProvenance(props.bindings)}>
      <div class="inspector__sect-title">Binding provenance</div>
      <dl class="inspector__binding-prov" data-testid="binding-provenance">
        <Show when={props.bindings.workspace_id}>
          <div class="inspector__binding-prov-row">
            <dt>Workspace</dt>
            <dd data-testid="binding-workspace">{props.bindings.workspace_id}</dd>
          </div>
        </Show>
        <Show when={props.bindings.blueprint_path}>
          <div class="inspector__binding-prov-row">
            <dt>Blueprint path</dt>
            <dd data-testid="binding-blueprint-path">{props.bindings.blueprint_path}</dd>
          </div>
        </Show>
        <For each={Object.entries(props.bindings.overlay ?? {})}>
          {([key, value]) => (
            <div class="inspector__binding-prov-row inspector__binding-prov-row--overlay">
              <dt>{key}</dt>
              <dd data-testid={`binding-overlay-${key}`}>{formatBindingValue(value)}</dd>
            </div>
          )}
        </For>
        <For each={Object.entries(props.bindings.activation ?? {})}>
          {([key, value]) => (
            <div class="inspector__binding-prov-row inspector__binding-prov-row--activation">
              <dt>{key}</dt>
              <dd data-testid={`binding-activation-${key}`}>
                {formatBindingValue(value)}
              </dd>
            </div>
          )}
        </For>
      </dl>
    </Show>
  );
}
