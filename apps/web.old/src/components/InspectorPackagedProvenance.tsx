/**
 * Renders the packaged-binding provenance block (where a binding's value came
 * from) inside the Inspector bindings tab.
 */
import { For, Show } from 'solid-js';
import {
  formatBindingValue,
  hasPackagedProvenance,
  type PackagedProvenance,
} from './InspectorBindingsModel.js';
import { trustTone } from '../statusTones.js';

export function InspectorPackagedProvenance(props: {
  packaged?: PackagedProvenance;
}) {
  const packaged = () => props.packaged;
  const hasContent = () => {
    const value = packaged();
    return !!value && hasPackagedProvenance(value);
  };

  return (
    <Show when={hasContent()}>
      <div class="inspector__sect-title">Packaged provenance</div>
      <dl class="inspector__binding-prov" data-testid="binding-packaged">
        <Show when={packaged()?.enabled !== undefined}>
          <div class="inspector__binding-prov-row">
            <dt>Trust</dt>
            <dd data-testid="packaged-trust">
              {(() => {
                const label = packaged()?.enabled ? 'enabled' : 'disabled';
                return (
                  <span class={'inspector__chip inspector__chip--' + trustTone(label)}>
                    {label}
                  </span>
                );
              })()}
            </dd>
          </div>
        </Show>
        <Show when={packaged()?.version}>
          <div class="inspector__binding-prov-row">
            <dt>Version</dt>
            <dd data-testid="packaged-version">{packaged()?.version}</dd>
          </div>
        </Show>
        <Show when={packaged()?.scope}>
          <div class="inspector__binding-prov-row">
            <dt>Scope</dt>
            <dd data-testid="packaged-scope">{packaged()?.scope}</dd>
          </div>
        </Show>
        <For each={Object.entries(packaged()?.install ?? {})}>
          {([key, value]) => (
            <div class="inspector__binding-prov-row inspector__binding-prov-row--install">
              <dt>install.{key}</dt>
              <dd data-testid={`packaged-install-${key}`}>{formatBindingValue(value)}</dd>
            </div>
          )}
        </For>
        <For each={Object.entries(packaged()?.bootstrap ?? {})}>
          {([key, value]) => (
            <div class="inspector__binding-prov-row inspector__binding-prov-row--bootstrap">
              <dt>bootstrap.{key}</dt>
              <dd data-testid={`packaged-bootstrap-${key}`}>
                {formatBindingValue(value)}
              </dd>
            </div>
          )}
        </For>
        <Show when={(packaged()?.validation_errors?.length ?? 0) > 0}>
          <div class="inspector__binding-prov-row inspector__binding-prov-row--errors">
            <dt>Validation</dt>
            <dd data-testid="packaged-validation-errors">
              <ul class="inspector__packaged-errors">
                <For each={packaged()?.validation_errors}>{(err) => <li>{err}</li>}</For>
              </ul>
            </dd>
          </div>
        </Show>
      </dl>
    </Show>
  );
}
