/**
 * Discovery surface: Plugin Form component. Key export `PluginForm`.
 */
import { createEffect, createSignal, Show } from 'solid-js';
import type { PluginDef } from '../../plugins.js';
import {
  buildPluginDef,
  pluginFormValuesFromDef,
} from './PluginRegistryPanelsModel.js';

export function PluginForm(props: {
  editing: PluginDef | null;
  onSave: (def: PluginDef, editing: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = createSignal('');
  const [path, setPath] = createSignal('');
  const [argsText, setArgsText] = createSignal('');
  const [trigger, setTrigger] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [timeoutMs, setTimeoutMs] = createSignal('10000');

  function clearFields() {
    const values = pluginFormValuesFromDef(null);
    setName(values.name);
    setPath(values.path);
    setArgsText(values.argsText);
    setTrigger(values.trigger);
    setDescription(values.description);
    setTimeoutMs(values.timeoutMs);
  }

  createEffect(() => {
    const def = props.editing;
    if (!def) {
      clearFields();
      return;
    }
    const values = pluginFormValuesFromDef(def);
    setName(values.name);
    setPath(values.path);
    setArgsText(values.argsText);
    setTrigger(values.trigger);
    setDescription(values.description);
    setTimeoutMs(values.timeoutMs);
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const editing = props.editing !== null;
    const def = buildPluginDef(props.editing, {
      name: name(),
      path: path(),
      argsText: argsText(),
      trigger: trigger(),
      description: description(),
      timeoutMs: timeoutMs(),
    });
    if (!def) return;
    props.onSave(def, editing);
    clearFields();
  }

  return (
    <form class="rmp__install" onSubmit={submit} data-testid="plugin-form">
      <div
        class="rmp__editor-actions"
        style="justify-content: flex-start; gap: 8px; margin-top: 0; margin-bottom: 10px"
      >
        <strong style="font-family: var(--font-sans); font-size: 13px">
          {props.editing ? 'Edit plugin' : 'Register a new plugin'}
        </strong>
      </div>
      <div class="ws-form__row">
        <span class="ws-form__label">Name</span>
        <input
          class="ws-form__input"
          type="text"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          placeholder="lint"
          data-testid="plugin-name"
        />
      </div>
      <div class="ws-form__row">
        <span class="ws-form__label">Executable path</span>
        <input
          class="ws-form__input"
          type="text"
          value={path()}
          onInput={(e) => setPath(e.currentTarget.value)}
          placeholder="/usr/local/bin/eslint"
          data-testid="plugin-path"
        />
      </div>
      <div class="ws-form__row">
        <span class="ws-form__label">Default args (one per line)</span>
        <textarea
          class="ws-form__input"
          rows={3}
          value={argsText()}
          onInput={(e) => setArgsText(e.currentTarget.value)}
          placeholder={'--fix\n--format=json'}
          data-testid="plugin-args"
        />
      </div>
      <div class="ws-form__row">
        <span class="ws-form__label">Slash trigger (optional)</span>
        <input
          class="ws-form__input"
          type="text"
          value={trigger()}
          onInput={(e) => setTrigger(e.currentTarget.value)}
          placeholder="/lint"
          data-testid="plugin-trigger"
        />
      </div>
      <div class="ws-form__row">
        <span class="ws-form__label">Description (optional)</span>
        <input
          class="ws-form__input"
          type="text"
          value={description()}
          onInput={(e) => setDescription(e.currentTarget.value)}
          placeholder="Run the repo's lint script"
          data-testid="plugin-description"
        />
      </div>
      <div class="ws-form__row">
        <span class="ws-form__label">Timeout (ms)</span>
        <input
          class="ws-form__input"
          type="number"
          min="100"
          max="60000"
          value={timeoutMs()}
          onInput={(e) => setTimeoutMs(e.currentTarget.value)}
          data-testid="plugin-timeout"
        />
      </div>
      <div class="rmp__editor-actions">
        <Show when={props.editing}>
          <button type="button" class="ws-form__btn" onClick={props.onCancel}>
            Cancel
          </button>
        </Show>
        <button
          type="submit"
          class="ws-form__btn ws-form__btn--primary"
          disabled={!name().trim() || !path().trim()}
          data-testid="plugin-save"
        >
          {props.editing ? 'Update plugin' : 'Register'}
        </button>
      </div>
    </form>
  );
}
