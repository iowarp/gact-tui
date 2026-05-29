import { For, Show, createSignal } from 'solid-js';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import {
  invokePlugin,
  listPlugins,
  removePlugin,
  savePlugin,
  type PluginDef,
  type PluginInvocationResult,
} from '../../plugins.js';
import { inTauri } from '../../tauri.js';
import { useToast } from '../../components/Toast.js';

/**
 * Plugins discovery — mirrors the TUI's `~/.config/gact/plugins/`
 * model. The user registers an executable + default args; the
 * desktop shell execs it via the `exec_plugin` Tauri command.
 *
 * Pure-web shells render the registry but disable Run buttons with
 * a "open in CLIO Desktop" hint, since the browser has no exec
 * surface.
 */
export function PluginsPage() {
  const [plugins, setPlugins] = createSignal<PluginDef[]>(listPlugins());
  const toast = useToast();

  // Add-form state. Inline editor to avoid yet another modal.
  const [name, setName] = createSignal('');
  const [path, setPath] = createSignal('');
  const [argsText, setArgsText] = createSignal('');
  const [trigger, setTrigger] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [timeoutMs, setTimeoutMs] = createSignal('10000');
  const [editingId, setEditingId] = createSignal<string | null>(null);

  function resetForm() {
    setName('');
    setPath('');
    setArgsText('');
    setTrigger('');
    setDescription('');
    setTimeoutMs('10000');
    setEditingId(null);
  }

  function startEdit(def: PluginDef) {
    setEditingId(def.id);
    setName(def.name);
    setPath(def.path);
    setArgsText(def.args.join('\n'));
    setTrigger(def.trigger ?? '');
    setDescription(def.description ?? '');
    setTimeoutMs(String(def.timeoutMs ?? 10000));
  }

  function submitForm(e: SubmitEvent) {
    e.preventDefault();
    if (!name().trim() || !path().trim()) return;
    const id =
      editingId() ??
      `${name().trim().toLowerCase().replace(/\W+/g, '-')}-${Date.now().toString(36)}`;
    const t = parseInt(timeoutMs(), 10);
    const def: PluginDef = {
      id,
      name: name().trim(),
      path: path().trim(),
      args: argsText()
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      ...(trigger().trim() ? { trigger: trigger().trim() } : {}),
      ...(description().trim() ? { description: description().trim() } : {}),
      ...(Number.isFinite(t) && t > 0 ? { timeoutMs: t } : {}),
    };
    setPlugins(savePlugin(def));
    resetForm();
    toast.push({
      tone: 'success',
      title: editingId() ? 'Plugin updated' : 'Plugin registered',
      body: def.name,
      duration: 2400,
    });
  }

  function dropPlugin(def: PluginDef) {
    if (!confirm(`Unregister plugin "${def.name}"? The binary is not touched.`))
      return;
    setPlugins(removePlugin(def.id));
  }

  async function runPlugin(def: PluginDef) {
    let result: PluginInvocationResult;
    try {
      result = await invokePlugin(def);
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Plugin failed',
        body: e instanceof Error ? e.message : String(e),
        duration: 5000,
      });
      return;
    }
    const tone =
      result.status === 0 && !result.timed_out
        ? 'success'
        : result.timed_out
          ? 'warn'
          : 'error';
    toast.push({
      tone,
      title:
        result.timed_out
          ? `${def.name} timed out after ${result.duration_ms}ms`
          : `${def.name} → exit ${result.status} (${result.duration_ms}ms)`,
      body: (result.stdout || result.stderr || '').slice(0, 240),
      duration: 5000,
    });
  }

  return (
    <DiscoveryPage
      icon="tool"
      title="Plugins"
      subtitle={
        inTauri()
          ? 'Local executables the desktop shell can run on demand. Mirrors the TUI ~/.config/gact/plugins/ model.'
          : 'Registry view — execution needs the CLIO Desktop shell, not the pure-web build.'
      }
      actions={
        <button
          type="button"
          class="dp-iconbtn"
          onClick={() => setPlugins(listPlugins())}
          title="Refresh"
        >
          <Icon name="regenerate" size={14} />
        </button>
      }
      empty={plugins().length === 0 && !editingId()}
      emptyTitle="No plugins registered"
      emptyBody="Use the form below to register your first executable."
    >
      <form class="rmp__install" onSubmit={submitForm} data-testid="plugin-form">
        <div class="rmp__editor-actions" style="justify-content: flex-start; gap: 8px; margin-top: 0; margin-bottom: 10px">
          <strong style="font-family: var(--font-sans); font-size: 13px">
            {editingId() ? 'Edit plugin' : 'Register a new plugin'}
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
            placeholder="--fix\n--format=json"
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
          <Show when={editingId()}>
            <button
              type="button"
              class="ws-form__btn"
              onClick={resetForm}
            >
              Cancel
            </button>
          </Show>
          <button
            type="submit"
            class="ws-form__btn ws-form__btn--primary"
            disabled={!name().trim() || !path().trim()}
            data-testid="plugin-save"
          >
            {editingId() ? 'Update plugin' : 'Register'}
          </button>
        </div>
      </form>

      <Show when={plugins().length > 0}>
        <div class="dp__section-title">Registered ({plugins().length})</div>
        <div class="dp__grid">
          <For each={plugins()}>
            {(def) => (
              <article class="dp__card" data-testid={`plugin-card-${def.id}`}>
                <header class="dp__card-head">
                  <div class="dp__card-title-row">
                    <div class="dp__card-icon">
                      <Icon name="tool" size={14} />
                    </div>
                    <div style="min-width:0">
                      <h3 class="dp__card-title">{def.name}</h3>
                      <Show when={def.trigger}>
                        <div class="dp__card-sub">{def.trigger}</div>
                      </Show>
                    </div>
                  </div>
                </header>
                <dl class="dp__card-kv">
                  <dt>path</dt>
                  <dd title={def.path}>{def.path}</dd>
                  <Show when={def.args.length > 0}>
                    <dt>args</dt>
                    <dd>{def.args.join(' ')}</dd>
                  </Show>
                  <Show when={def.description}>
                    <dt>desc</dt>
                    <dd>{def.description}</dd>
                  </Show>
                  <Show when={def.timeoutMs}>
                    <dt>timeout</dt>
                    <dd>{def.timeoutMs}ms</dd>
                  </Show>
                </dl>
                <div class="dp__card-actions">
                  <button
                    type="button"
                    class="dp__card-btn"
                    onClick={() => void runPlugin(def)}
                    disabled={!inTauri()}
                    title={inTauri() ? 'Execute now' : 'Pure-web build can\'t exec — open in CLIO Desktop'}
                    data-testid={`plugin-run-${def.id}`}
                  >
                    Run
                  </button>
                  <button
                    type="button"
                    class="dp__card-btn"
                    onClick={() => startEdit(def)}
                    data-testid={`plugin-edit-${def.id}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="dp__card-btn dp__card-btn--danger"
                    onClick={() => dropPlugin(def)}
                    data-testid={`plugin-remove-${def.id}`}
                  >
                    Remove
                  </button>
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>
    </DiscoveryPage>
  );
}
