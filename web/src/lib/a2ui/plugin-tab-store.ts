import {
  decodeEventEnvelope,
  decodePluginTabEvent,
  TransportError,
  type A2UISurface,
  type A2UISurfaceOwner,
  type PluginTabOpened,
} from '@clio/core/v3';
import { create } from 'zustand';

/**
 * A plugin tab's surfaces (HS3). They are not in the transcript: they live here
 * while the tab is open, keyed by conversation and tab, so a tab in the
 * background keeps following its `plugin_tab.*` events while its panel is
 * unmounted. Closing the tab drops them here and on the service.
 */
export interface PluginTabState {
  status: 'loading' | 'ready' | 'unavailable' | 'error';
  surfaces: A2UISurface[];
  revision: number;
  /** An HS1 or HS3 reason when the tab is empty or unavailable. */
  reason?: string;
  detail?: string;
  /** A missed revision or a refresh naming an unknown surface: read the tab again. */
  stale: boolean;
  /** The tab's server, so a surface it sent without an owner still routes to it. */
  owner?: A2UISurfaceOwner;
}

interface PluginTabRepository {
  openPluginTab(sessionId: string, tabId: string, signal?: AbortSignal): Promise<PluginTabOpened>;
  closePluginTab(sessionId: string, tabId: string): Promise<{ closed: boolean }>;
}

interface PluginTabStore {
  tabs: Record<string, PluginTabState>;
}

const usePluginTabStore = create<PluginTabStore>(() => ({ tabs: {} }));

/** Who to tell when a tab closes, and the read in flight, per open tab. */
const opened = new Map<string, { repository: PluginTabRepository; controller?: AbortController }>();

function key(sessionId: string, tabId: string): string {
  return `${sessionId}\u0000${tabId}`;
}

function owned(surface: A2UISurface, owner: A2UISurfaceOwner | undefined): A2UISurface {
  return surface.owner || !owner ? surface : { ...surface, owner };
}

function update(entry: string, change: (state: PluginTabState) => PluginTabState | undefined) {
  usePluginTabStore.setState((store) => {
    const current = store.tabs[entry];
    if (!current) return store;
    const next = change(current);
    return next && next !== current ? { tabs: { ...store.tabs, [entry]: next } } : store;
  });
}

export function usePluginTabState(sessionId: string, tabId: string): PluginTabState | undefined {
  return usePluginTabStore((store) => store.tabs[key(sessionId, tabId)]);
}

/** Reads the tab's resource; its surfaces replace everything the tab held. */
export async function openPluginTab(
  repository: PluginTabRepository,
  sessionId: string,
  tabId: string,
): Promise<void> {
  const entry = key(sessionId, tabId);
  opened.get(entry)?.controller?.abort();
  const controller = new AbortController();
  opened.set(entry, { repository, controller });
  usePluginTabStore.setState((store) => ({
    tabs: {
      ...store.tabs,
      [entry]: {
        surfaces: store.tabs[entry]?.surfaces ?? [],
        revision: store.tabs[entry]?.revision ?? 0,
        owner: store.tabs[entry]?.owner,
        status: 'loading',
        stale: false,
      },
    },
  }));
  try {
    const result = await repository.openPluginTab(sessionId, tabId, controller.signal);
    if (controller.signal.aborted || !opened.has(entry)) return;
    const owner: A2UISurfaceOwner = {
      kind: 'server',
      plugin: result.tab.plugin,
      plugin_title: result.tab.plugin_title,
      server: result.tab.server,
      namespace: '',
    };
    usePluginTabStore.setState((store) => ({
      tabs: {
        ...store.tabs,
        [entry]: {
          status: result.tab.available ? 'ready' : 'unavailable',
          surfaces: result.surfaces.map((surface) => owned(surface, owner)),
          revision: result.revision,
          reason: result.tab.reason || undefined,
          stale: false,
          owner,
        },
      },
    }));
  } catch (error) {
    if (controller.signal.aborted || !opened.has(entry)) return;
    const code = error instanceof TransportError ? error.code : undefined;
    usePluginTabStore.setState((store) => ({
      tabs: {
        ...store.tabs,
        [entry]: {
          status: code?.startsWith('plugin_tab_') ? 'unavailable' : 'error',
          surfaces: [],
          revision: 0,
          reason: code,
          detail: error instanceof Error ? error.message : undefined,
          stale: false,
        },
      },
    }));
  } finally {
    const current = opened.get(entry);
    if (current?.controller === controller) current.controller = undefined;
  }
}

/** The tab closed: forget its surfaces and tell the service. */
export function releasePluginTab(sessionId: string, tabId: string): void {
  const entry = key(sessionId, tabId);
  const handle = opened.get(entry);
  opened.delete(entry);
  handle?.controller?.abort();
  usePluginTabStore.setState((store) => {
    if (!(entry in store.tabs)) return store;
    const { [entry]: _closed, ...rest } = store.tabs;
    return { tabs: rest };
  });
  void handle?.repository.closePluginTab(sessionId, tabId).catch(() => undefined);
}

/**
 * Reads every open tab of the conversation again. The event stream's replay is
 * bounded, so after it reconnects or reports a gap the tabs may have missed
 * updates; `open` on an open tab re-reads it and keeps its watch.
 */
export function rereadPluginTabs(sessionId: string): void {
  const prefix = key(sessionId, '');
  for (const [entry, handle] of opened) {
    if (entry.startsWith(prefix))
      void openPluginTab(handle.repository, sessionId, entry.slice(prefix.length));
  }
}

/**
 * Whether a frame says the conversation's plugins were updated in place
 * (`session.updated` with `reason: "plugin_updated"`): its tab list, titles
 * and plugin names may have changed, so read them again. The open tabs'
 * surfaces re-stream on their own.
 */
export function pluginsUpdatedByFrame(frame: { eventName?: string; data: unknown }): boolean {
  if (frame.eventName !== 'session.updated') return false;
  try {
    const payload = decodeEventEnvelope(frame.data).payload as { reason?: unknown } | undefined;
    return payload?.reason === 'plugin_updated';
  } catch {
    return false;
  }
}

/** Applies a live `plugin_tab.*` frame to the conversation's open tab. */
export function dispatchPluginTabFrame(
  frame: { eventName?: string; data: unknown },
  sessionId: string,
): void {
  if (!frame.eventName?.startsWith('plugin_tab.')) return;
  let payload: unknown;
  try {
    payload = decodeEventEnvelope(frame.data).payload;
  } catch {
    return;
  }
  const event = decodePluginTabEvent(frame.eventName, payload);
  if (!event) return;
  const entry = key(sessionId, event.tab_id);
  if (event.type === 'plugin_tab.unavailable') {
    // No revision, and the surfaces stay: the next `refreshed` brings the tab back.
    update(entry, (state) =>
      state.status === 'loading'
        ? state
        : {
            ...state,
            status: 'unavailable',
            reason: event.reason || undefined,
            detail: event.detail || undefined,
          },
    );
    return;
  }
  update(entry, (state) => {
    if (state.status === 'loading') return state;
    if (event.type === 'plugin_tab.refreshed') {
      // A re-read's closing frame: it carries the last surface event's
      // revision and the whole live set. Any mismatch means missed events.
      const known = new Set(state.surfaces.map((surface) => surface.id));
      if (event.revision !== state.revision || event.surface_ids.some((id) => !known.has(id)))
        return { ...state, stale: true };
      const kept = new Set(event.surface_ids);
      return {
        ...state,
        status: 'ready',
        reason: undefined,
        detail: undefined,
        surfaces: state.surfaces.filter((surface) => kept.has(surface.id)),
      };
    }
    if (event.revision <= state.revision) return state;
    if (event.revision > state.revision + 1) return { ...state, stale: true };
    const revision = event.revision;
    if (event.type === 'plugin_tab.surface.upserted') {
      const surface = owned(event.surface, state.owner);
      const index = state.surfaces.findIndex((candidate) => candidate.id === surface.id);
      const surfaces =
        index < 0
          ? [...state.surfaces, surface]
          : state.surfaces.map((candidate, at) => (at === index ? surface : candidate));
      // A plugin updated in place re-streams with its new owner (and plugin_title).
      return { ...state, surfaces, revision, owner: surface.owner ?? state.owner };
    }
    return {
      ...state,
      surfaces: state.surfaces.filter((surface) => surface.id !== event.surface_id),
      revision,
    };
  });
  const handle = opened.get(entry);
  if (handle && !handle.controller && usePluginTabStore.getState().tabs[entry]?.stale)
    void openPluginTab(handle.repository, sessionId, event.tab_id);
}
