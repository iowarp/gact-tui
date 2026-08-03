/**
 * Thin controller for {@link SettingsShell}: owns the lazy {@link Client}
 * construction so the shell component stays a pure view.
 */
import { createMemo } from 'solid-js';
import { Client } from '@clio/core';
import { getRequestLocale } from '../locale.js';
import { inTauri, tauriFetch } from '../tauri.js';
import type { useBackendRegistry } from '../registry.js';

type BackendRegistry = ReturnType<typeof useBackendRegistry>;

/**
 * Builds a memoized client handle pointed at the registry's current backend.
 *
 * The discovery-style settings sections (Workspaces / Agents / etc.) need a
 * live {@link Client}, but we don't want to re-plumb a separate client per
 * section. Construct it lazily here and recompute only when the active backend
 * changes; returns `null` when no backend is selected.
 */
export function createSettingsShellController(registry: BackendRegistry) {
  const client = createMemo(() => {
    const cur = registry.current();
    if (!cur) return null;
    return new Client({
      baseUrl: cur.url,
      bearerToken: cur.bearerToken,
      fetch: inTauri() ? tauriFetch : undefined,
      getLocale: getRequestLocale,
    });
  });

  return { client };
}
