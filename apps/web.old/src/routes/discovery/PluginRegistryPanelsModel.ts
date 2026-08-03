/**
 * View-model / pure logic for Plugin Registry Panels: state shaping and helpers, no DOM. Key export `PluginFormValues`.
 */
import type { PluginDef } from '../../plugins.js';

export interface PluginFormValues {
  name: string;
  path: string;
  argsText: string;
  trigger: string;
  description: string;
  timeoutMs: string;
}

export const EMPTY_PLUGIN_FORM: PluginFormValues = {
  name: '',
  path: '',
  argsText: '',
  trigger: '',
  description: '',
  timeoutMs: '10000',
};

export function pluginFormValuesFromDef(def: PluginDef | null): PluginFormValues {
  if (!def) return EMPTY_PLUGIN_FORM;
  return {
    name: def.name,
    path: def.path,
    argsText: def.args.join('\n'),
    trigger: def.trigger ?? '',
    description: def.description ?? '',
    timeoutMs: String(def.timeoutMs ?? 10000),
  };
}

export function pluginArgsFromText(argsText: string): string[] {
  return argsText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function pluginIdFromName(name: string, idSeed: string): string {
  return `${name.trim().toLowerCase().replace(/\W+/g, '-')}-${idSeed}`;
}

export function buildPluginDef(
  editing: PluginDef | null,
  values: PluginFormValues,
  idSeed = Date.now().toString(36),
): PluginDef | null {
  const name = values.name.trim();
  const path = values.path.trim();
  if (!name || !path) return null;
  const timeoutMs = parseInt(values.timeoutMs, 10);
  const trigger = values.trigger.trim();
  const description = values.description.trim();
  return {
    id: editing?.id ?? pluginIdFromName(name, idSeed),
    name,
    path,
    args: pluginArgsFromText(values.argsText),
    ...(trigger ? { trigger } : {}),
    ...(description ? { description } : {}),
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
  };
}
