/**
 * Sidebar session-list store: a Solid resource over `/v1/sessions` with manual
 * refetch plus SSE-driven in-place patches. Exports {@link createLiveSessions}
 * and the {@link LiveSessionsHandle} it returns.
 */
import { createResource, createSignal, type Resource } from 'solid-js';
import { Client } from '@clio/core';
import type { SidebarSession } from './components/Sidebar.js';
import { getRequestLocale } from './locale.js';
import { toSidebarSession } from './LiveSessionsModel.js';
import { inTauri, tauriFetch } from './tauri.js';

export interface LiveStoreOptions {
  url: string;
  bearerToken: string;
}

export interface LiveSessionsHandle {
  sessions: Resource<SidebarSession[]>;
  /** Re-fetch the sessions list (e.g. after creating a new session). */
  refetch: () => void;
  /** Patch a single session in-place — used by the SSE reducer. */
  patch: (id: string, patch: Partial<SidebarSession>) => void;
  /** Replace the cached session list (additions/removals from SSE). */
  setRaw: (next: SidebarSession[] | ((prev: SidebarSession[]) => SidebarSession[])) => void;
  /** Surface the underlying Client for one-off RPCs (sendMessage etc.). */
  client: Client;
}

/**
 * Lists sessions on the connected backend. Used by Sidebar. Returns a
 * Solid resource that auto-fetches on mount, exposes a manual refetch,
 * and a `patch` helper for SSE-driven in-place updates so the pip flips
 * green->amber->red without us hammering /v1/sessions.
 */
export function createLiveSessions(opts: LiveStoreOptions): LiveSessionsHandle {
  const client = new Client({
    baseUrl: opts.url,
    bearerToken: opts.bearerToken,
    fetch: inTauri() ? tauriFetch : undefined,
    getLocale: getRequestLocale,
  });

  // `override` is a wholesale list replacement from SSE additions/removals
  // (setRaw). `patches` holds per-session SSE field patches (status/title pips)
  // keyed by session id. They are separate signals so a fresh resource refetch
  // can discard the stale wholesale list while *preserving* in-flight per-session
  // patches — otherwise the sidebar would lose pip updates on every refetch.
  const [override, setOverride] = createSignal<SidebarSession[] | null>(null);
  const [patches, setPatches] = createSignal<Record<string, Partial<SidebarSession>>>({});
  const [resource, { refetch }] = createResource<SidebarSession[]>(async () => {
    const { sessions: rows } = await client.sessions({ include_all_workspaces: true });
    const next = rows.map(toSidebarSession);
    // The wholesale override is now stale (the resource is the fresh source of
    // truth), but per-session patches stay so SSE updates aren't lost.
    setOverride(null);
    return next;
  });

  // Apply any pending per-session patches on top of a base list.
  function applyPatches(base: SidebarSession[]): SidebarSession[] {
    const p = patches();
    if (Object.keys(p).length === 0) return base;
    return base.map((b) => (p[b.id] ? { ...b, ...p[b.id] } : b));
  }

  const sessions: Resource<SidebarSession[]> = new Proxy(resource, {
    apply() {
      // Resources are called as functions; merge override + patches on top.
      const base = override() ?? resource() ?? [];
      return applyPatches(base);
    },
    get(target, prop, recv) {
      if (prop === Symbol.toPrimitive) return undefined;
      return Reflect.get(target, prop, recv);
    },
  }) as Resource<SidebarSession[]>;

  function patch(id: string, p: Partial<SidebarSession>) {
    const base = override() ?? resource() ?? [];
    if (!base.some((b) => b.id === id)) return;
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  function setRaw(next: SidebarSession[] | ((prev: SidebarSession[]) => SidebarSession[])) {
    const base = applyPatches(override() ?? resource() ?? []);
    setOverride(typeof next === 'function' ? next(base) : next);
  }

  return { sessions, refetch: () => void refetch(), patch, setRaw, client };
}
