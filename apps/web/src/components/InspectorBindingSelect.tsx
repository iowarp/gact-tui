/**
 * Select control for choosing a blueprint/expert binding in the inspector.
 * Exports {@link InspectorBindingSelect}.
 */
import { For, Show } from 'solid-js';
import {
  selectedBindingDescription,
  type BindingOption,
} from './InspectorBindingsModel.js';

export function InspectorBindingSelect(props: {
  title: string;
  value: string | null;
  options: BindingOption[];
  testId: string;
  onSetValue?: (id: string | null) => void | Promise<void>;
}) {
  const description = () => selectedBindingDescription(props.value, props.options);

  return (
    <>
      <div class="inspector__sect-title">{props.title}</div>
      <select
        class="inspector__binding-select"
        value={props.value ?? ''}
        onChange={(e) => {
          const v = e.currentTarget.value;
          void props.onSetValue?.(v === '' ? null : v);
        }}
        data-testid={props.testId}
      >
        <option value="">— None —</option>
        <For each={props.options}>
          {(option) => <option value={option.id}>{option.label}</option>}
        </For>
      </select>
      <Show when={description()}>
        <p class="inspector__binding-desc">{description()}</p>
      </Show>
    </>
  );
}
