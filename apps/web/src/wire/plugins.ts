/**
 * Plugins registry. Mirrors the TUI's `~/.config/gact/plugins/`
 * behaviour: the user registers an executable + default args, and
 * the desktop shell execs it via the `exec_plugin` Tauri command.
 *
 * In pure-web mode this stays callable for registration UX but
 * `invokePlugin` will reject because there's no shell to exec
 * against — the caller surfaces that as a "Open in Desktop" hint.
 */

import { brand } from '@brand';
import { invoke } from '../tauri/tauriApi.js';
import { inTauri } from '../tauri/tauri.js';

export const PLUGINS_KEY = 'clio.plugins.v1';

export interface PluginDef {
  id: string;
  /** Display name surfaced in the palette + settings. */
  name: string;
  /** Absolute path or PATH-resolvable command. */
  path: string;
  /** Default argv tail. Per-invocation args append. */
  args: string[];
  /** Slash-command trigger surfaced in the palette (e.g. `/lint`).
   * When omitted, the plugin only runs via the Plugins discovery
   * page. */
  trigger?: string;
  /** Short description rendered next to the trigger. */
  description?: string;
  /** Per-call wall-clock budget in milliseconds. Defaults to 10_000. */
  timeoutMs?: number;
}

export interface PluginInvocationResult {
  status: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function listPlugins(): PluginDef[] {
  const ls = safeStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(PLUGINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PluginDef =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as PluginDef).id === 'string' &&
        typeof (p as PluginDef).path === 'string',
    );
  } catch {
    return [];
  }
}

export function savePlugin(def: PluginDef): PluginDef[] {
  const ls = safeStorage();
  const cur = listPlugins().filter((p) => p.id !== def.id);
  const next = [...cur, def];
  if (ls) {
    try {
      ls.setItem(PLUGINS_KEY, JSON.stringify(next));
    } catch {
      /* quota — best effort */
    }
  }
  return next;
}

export function removePlugin(id: string): PluginDef[] {
  const ls = safeStorage();
  const next = listPlugins().filter((p) => p.id !== id);
  if (ls) {
    try {
      if (next.length === 0) ls.removeItem(PLUGINS_KEY);
      else ls.setItem(PLUGINS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

/**
 * Execute a plugin via the Tauri shell. Returns the captured stdout
 * + stderr + duration + timed_out flag. Rejects when invoked outside
 * Tauri (pure-web shell).
 */
export async function invokePlugin(
  def: PluginDef,
  extraArgs: string[] = [],
  opts: { cwd?: string } = {},
): Promise<PluginInvocationResult> {
  if (!inTauri()) {
    throw new Error(
      `Plugins need the ${brand.name} Desktop shell — open this in the desktop app to execute.`,
    );
  }
  const args = [...(def.args ?? []), ...extraArgs];
  return invoke<PluginInvocationResult>('exec_plugin', {
    req: {
      path: def.path,
      args,
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
      ...(def.timeoutMs ? { timeout_ms: def.timeoutMs } : {}),
    },
  });
}
