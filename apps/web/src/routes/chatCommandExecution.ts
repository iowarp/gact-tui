/**
 * Executes slash/plugin commands against the backend: builds the invocation
 * message and submits it. Exports the submitter/options contracts.
 */
import type { Accessor } from 'solid-js';
import type { SlashCommand } from '../components/SlashPalette.js';
import { invokePlugin, listPlugins, type PluginDef, type PluginInvocationResult } from '../plugins.js';

export interface ChatCommandSubmitter {
  onSubmit?: (text: string) => Promise<void> | void;
}

export interface BackendCommandOptions extends ChatCommandSubmitter {
  activeId: Accessor<string>;
  onRunCommand?: (commandId: string, args: Record<string, unknown>) => Promise<unknown>;
}

export function pluginInvocationMessage(
  plugin: PluginDef,
  result: PluginInvocationResult,
): string | null {
  const out = (result.stdout || result.stderr || '').trim();
  if (!out) return null;
  const tail = out.length > 1800 ? `${out.slice(0, 1800)}\n… (truncated)` : out;
  return `Plugin \`${plugin.name}\` (exit ${result.status}, ${result.duration_ms}ms):\n\n\`\`\`\n${tail}\n\`\`\``;
}

export function pluginFailureMessage(plugin: PluginDef, error: unknown): string {
  return `Plugin \`${plugin.name}\` failed: ${error instanceof Error ? error.message : String(error)}`;
}

export function runPluginCommand(cmd: SlashCommand, options: ChatCommandSubmitter) {
  const pid = cmd.id.slice('plugin:'.length);
  const def = listPlugins().find((plugin) => plugin.id === pid);
  if (!def) return;

  void invokePlugin(def)
    .then((result) => {
      const message = pluginInvocationMessage(def, result);
      if (!message || !options.onSubmit) return;
      void options.onSubmit(message);
    })
    .catch((error: unknown) => {
      void options.onSubmit?.(pluginFailureMessage(def, error));
    });
}

export function runBackendCommand(cmd: SlashCommand, options: BackendCommandOptions) {
  const run = options.onRunCommand;
  if (run && options.activeId()) {
    void Promise.resolve(run(cmd.id, {})).catch(() => {
      void options.onSubmit?.(cmd.trigger);
    });
  } else {
    void options.onSubmit?.(cmd.trigger);
  }
}
