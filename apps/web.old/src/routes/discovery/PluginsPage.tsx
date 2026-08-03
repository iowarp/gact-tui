/**
 * Discovery surface: Plugins Page component. Key export `PluginsPage`.
 */
import { For, Show, createSignal } from 'solid-js';
import { brand } from '@brand';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import {
  invokePlugin,
  listPlugins,
  removePlugin,
  savePlugin,
  type PluginDef,
} from '../../plugins.js';
import { inTauri } from '../../tauri.js';
import { useToast } from '../../components/Toast.js';
import { PluginCard, PluginForm } from './PluginRegistryPanels.js';
import {
  findEditingPlugin,
  pluginPageSubtitle,
  pluginRunFailureToast,
  pluginRunResultToast,
  pluginSaveToast,
  removePluginPrompt,
} from './PluginsPageModel.js';
import './roadmap-page.css';

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
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const editingPlugin = () => findEditingPlugin(plugins(), editingId());

  function savePluginDef(def: PluginDef, editing: boolean) {
    setPlugins(savePlugin(def));
    setEditingId(null);
    toast.push(pluginSaveToast(def, editing));
  }

  function dropPlugin(def: PluginDef) {
    if (!confirm(removePluginPrompt(def))) return;
    setPlugins(removePlugin(def.id));
  }

  async function runPlugin(def: PluginDef) {
    try {
      const result = await invokePlugin(def);
      toast.push(pluginRunResultToast(def, result));
    } catch (e) {
      toast.push(pluginRunFailureToast(e));
    }
  }

  return (
    <DiscoveryPage
      icon="tool"
      title="Plugins"
      subtitle={pluginPageSubtitle(inTauri(), brand.name)}
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
    >
      <Show when={plugins().length === 0 && !editingId()}>
        <div
          class="dp__empty"
          data-testid="plugins-empty-hint"
          style="padding-block: 16px"
        >
          <div class="dp__empty-icon">
            <Icon name="tool" size={28} />
          </div>
          <h2 class="dp__empty-title">No plugins registered</h2>
          <p class="dp__empty-body">
            Use the form below to register your first executable.
          </p>
        </div>
      </Show>
      <PluginForm
        editing={editingPlugin()}
        onSave={savePluginDef}
        onCancel={() => setEditingId(null)}
      />

      <Show when={plugins().length > 0}>
        <div class="dp__section-title">Registered ({plugins().length})</div>
        <div class="dp__grid">
          <For each={plugins()}>
            {(def) => (
              <PluginCard
                def={def}
                canRun={inTauri()}
                desktopName={brand.name}
                onRun={() => void runPlugin(def)}
                onEdit={() => setEditingId(def.id)}
                onRemove={() => dropPlugin(def)}
              />
            )}
          </For>
        </div>
      </Show>
    </DiscoveryPage>
  );
}
