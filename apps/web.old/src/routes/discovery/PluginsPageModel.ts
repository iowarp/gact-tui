/**
 * View-model / pure logic for Plugins Page: state shaping and helpers, no DOM. Key export `pluginPageSubtitle`.
 */
import type { ToastInput } from '../../components/Toast.js';
import type { PluginDef, PluginInvocationResult } from '../../plugins.js';

export function pluginPageSubtitle(canRunPlugins: boolean, desktopName: string): string {
  return canRunPlugins
    ? 'Local executables the desktop shell can run on demand. Mirrors the TUI ~/.config/gact/plugins/ model.'
    : `Registry view — execution needs the ${desktopName} Desktop shell, not the pure-web build.`;
}

export function findEditingPlugin(
  plugins: PluginDef[],
  editingId: string | null,
): PluginDef | null {
  return plugins.find((plugin) => plugin.id === editingId) ?? null;
}

export function removePluginPrompt(def: PluginDef): string {
  return `Unregister plugin "${def.name}"? The binary is not touched.`;
}

export function pluginSaveToast(def: PluginDef, editing: boolean): ToastInput {
  return {
    tone: 'success',
    title: editing ? 'Plugin updated' : 'Plugin registered',
    body: def.name,
    duration: 2400,
  };
}

export function pluginRunFailureToast(error: unknown): ToastInput {
  return {
    tone: 'error',
    title: 'Plugin failed',
    body: error instanceof Error ? error.message : String(error),
    duration: 5000,
  };
}

export function pluginRunResultToast(
  def: PluginDef,
  result: PluginInvocationResult,
): ToastInput {
  const tone =
    result.status === 0 && !result.timed_out
      ? 'success'
      : result.timed_out
        ? 'warn'
        : 'error';
  return {
    tone,
    title: result.timed_out
      ? `${def.name} timed out after ${result.duration_ms}ms`
      : `${def.name} → exit ${result.status} (${result.duration_ms}ms)`,
    body: (result.stdout || result.stderr || '').slice(0, 240),
    duration: 5000,
  };
}
