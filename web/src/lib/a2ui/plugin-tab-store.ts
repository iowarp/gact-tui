import {
  decodeEventEnvelope,
  decodePluginPageEvent,
  decodePluginTabEvent,
  TransportError,
  type A2UISurface,
  type A2UISurfaceOwner,
  type PluginPageOpened,
  type PluginTabOpened,
} from '@clio/core/v3';
import { create } from 'zustand';
import { readRetryDelayMs, serviceStillStarting } from '@/lib/connection-attempt';
import { STARTING_READ_RETRIES } from '@/lib/runtime-limits';

/**
 * A plugin tab's surfaces (HS3). They are not in the transcript: they live here
 * while the tab is open, keyed by conversation and tab, so a tab in the
 * background keeps following its `plugin_tab.*` events while its panel is
 * unmounted. Closing the tab drops them here and on the service.
 */
export interface PluginTabState {
  /** `cancelled`: the person stopped waiting for an open; Retry reads it again. */
  status: 'loading' | 'ready' | 'unavailable' | 'error' | 'cancelled';
  /** An open has gone unanswered long enough to offer Cancel and Retry. */
  stillWaiting?: boolean;
  /** Retries of an unanswered open; each waits longer before asking again. */
  attempt?: number;
  surfaces: A2UISurface[];
  revision: number;
  /** An HS1 or HS3 reason when the tab is empty or unavailable. */
  reason?: string;
  detail?: string;
  /** A missed revision or a refresh naming an unknown surface: read the tab again. */
  stale: boolean;
  /** The tab's server, so a surface it sent without an owner still routes to it. */
  owner?: A2UISurfaceOwner;
  /** A plugin page's host-owned context session: its events, catalogs and questions. */
  contextSessionId?: string;
  /** The surfaces are the page's last stored view, shown while the live read runs. */
  stored?: boolean;
}

interface PluginTabRepository {
  openPluginTab(
    sessionId: string,
    tabId: string,
    signal?: AbortSignal,
  ): Promise<PluginTabOpened & { context_session_id?: string }>;
  closePluginTab(sessionId: string, tabId: string): Promise<{ closed: boolean }>;
}

interface PluginTabStore {
  tabs: Record<string, PluginTabState>;
}

const usePluginTabStore = create<PluginTabStore>(() => ({ tabs: {} }));

/** Who to tell when a tab closes, and the read in flight, per open tab. */
const opened = new Map<string, { repository: PluginTabRepository; controller?: AbortController }>();

/**
 * A view that unmounts and mounts again at once (React's development double
 * effect, a route bounce) would send open, close, open, and the service could
 * apply the close last. So a close waits this long and an open in the
 * meantime cancels it; an open after a close was sent waits for it.
 */
const CLOSE_GRACE_MS = 400;
const closing = new Map<
  string,
  { timer?: ReturnType<typeof setTimeout>; sent?: Promise<unknown> }
>();

/**
 * An open may wait minutes (a server's first start, a consent answer), but the
 * person is never held: after this long it offers Cancel and Retry. Each
 * Retry doubles the wait before asking again, up to the cap. Unit: ms.
 */
const STILL_WAITING_MS = 30_000;
const STILL_WAITING_MAX_MS = 8 * 60_000;

function stillWaitingAfter(attempt: number): number {
  return Math.min(STILL_WAITING_MS * 2 ** attempt, STILL_WAITING_MAX_MS);
}

/**
 * Plugin pages share the tab store under one scope of their own: they are
 * global, so no conversation keys them.
 */
export const PLUGIN_PAGE_SCOPE = '\u0001page';

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

/**
 * A service that is still starting (just restarted, health answers before its task
 * runtime) is waited out with the connect backoff, so an open made at once still lands.
 */
async function openWhileStarting<T>(open: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let failures = 0; ; failures += 1) {
    try {
      return await open();
    } catch (error) {
      if (
        signal.aborted ||
        failures >= STARTING_READ_RETRIES ||
        !(error instanceof Error) ||
        !serviceStillStarting(error)
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, readRetryDelayMs(failures, error)));
      if (signal.aborted) throw error;
    }
  }
}

/**
 * Reads the tab's resource; its surfaces replace everything the tab held.
 * `retry` is the person's Retry after a long wait: the next one asks later.
 */
export async function openPluginTab(
  repository: PluginTabRepository,
  sessionId: string,
  tabId: string,
  options: { retry?: boolean } = {},
): Promise<void> {
  const entry = key(sessionId, tabId);
  opened.get(entry)?.controller?.abort();
  const pending = closing.get(entry);
  if (pending?.timer !== undefined) {
    clearTimeout(pending.timer);
    closing.delete(entry);
  }
  const controller = new AbortController();
  opened.set(entry, { repository, controller });
  const previous = usePluginTabStore.getState().tabs[entry];
  // A re-read during a long wait keeps its count; an answered open starts over.
  const waited = previous?.status === 'loading' || previous?.status === 'cancelled';
  const attempt = (waited ? (previous.attempt ?? 0) : 0) + (options.retry ? 1 : 0);
  usePluginTabStore.setState((store) => ({
    tabs: {
      ...store.tabs,
      [entry]: {
        surfaces: store.tabs[entry]?.surfaces ?? [],
        revision: store.tabs[entry]?.revision ?? 0,
        owner: store.tabs[entry]?.owner,
        contextSessionId: store.tabs[entry]?.contextSessionId,
        stored: store.tabs[entry]?.stored,
        status: 'loading',
        attempt,
        stale: false,
      },
    },
  }));
  const waiting = setTimeout(() => {
    if (controller.signal.aborted) return;
    update(entry, (state) =>
      state.status === 'loading' ? { ...state, stillWaiting: true } : state,
    );
  }, stillWaitingAfter(attempt));
  try {
    if (pending?.sent) await pending.sent;
    if (controller.signal.aborted || !opened.has(entry)) return;
    const result = await openWhileStarting(
      () => repository.openPluginTab(sessionId, tabId, controller.signal),
      controller.signal,
    );
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
          contextSessionId: result.context_session_id,
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
          status:
            code?.startsWith('plugin_tab_') || code?.startsWith('plugin_page_')
              ? 'unavailable'
              : 'error',
          surfaces: [],
          revision: 0,
          reason: code,
          detail: error instanceof Error ? error.message : undefined,
          stale: false,
          contextSessionId: store.tabs[entry]?.contextSessionId,
        },
      },
    }));
  } finally {
    clearTimeout(waiting);
    const current = opened.get(entry);
    if (current?.controller === controller) current.controller = undefined;
  }
}

/**
 * The person stopped waiting for an open: drop the request and keep what the
 * tab showed. The tab stays open, so its events still arrive.
 */
export function cancelPluginTabOpen(sessionId: string, tabId: string): void {
  const entry = key(sessionId, tabId);
  const handle = opened.get(entry);
  handle?.controller?.abort();
  if (handle) handle.controller = undefined;
  update(entry, (state) =>
    state.status === 'loading' ? { ...state, status: 'cancelled', stillWaiting: false } : state,
  );
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
  if (!handle) return;
  const pending: { timer?: ReturnType<typeof setTimeout>; sent?: Promise<unknown> } = {};
  pending.timer = setTimeout(() => {
    pending.timer = undefined;
    pending.sent = handle.repository
      .closePluginTab(sessionId, tabId)
      .catch(() => undefined)
      .finally(() => {
        if (closing.get(entry) === pending) closing.delete(entry);
      });
  }, CLOSE_GRACE_MS);
  closing.set(entry, pending);
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

/** Applies a live `plugin_tab.*` frame to the conversation's open tab, or a `plugin_page.*` one to its page. */
export function dispatchPluginTabFrame(
  frame: { eventName?: string; data: unknown },
  sessionId: string,
): void {
  const page = frame.eventName?.startsWith('plugin_page.') ?? false;
  if (!page && !frame.eventName?.startsWith('plugin_tab.')) return;
  let payload: unknown;
  try {
    payload = decodeEventEnvelope(frame.data).payload;
  } catch {
    return;
  }
  const event = page
    ? decodePluginPageEvent(frame.eventName!, payload)
    : decodePluginTabEvent(frame.eventName!, payload);
  if (!event) return;
  const scope = page ? PLUGIN_PAGE_SCOPE : sessionId;
  const entry = key(scope, event.tab_id);
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
    void openPluginTab(handle.repository, scope, event.tab_id);
}

interface PluginPageRepository {
  openPluginPage(pageId: string, signal?: AbortSignal): Promise<PluginPageOpened>;
  closePluginPage(pageId: string): Promise<{ closed: boolean }>;
}

function pageRoutes(repository: PluginPageRepository): PluginTabRepository {
  return {
    openPluginTab: async (_scope, pageId, signal) => {
      const opened = await repository.openPluginPage(pageId, signal);
      return {
        tab: opened.page,
        surfaces: opened.surfaces,
        revision: opened.revision,
        context_session_id: opened.context_session_id,
      };
    },
    closePluginTab: (_scope, pageId) => repository.closePluginPage(pageId),
  };
}

export function usePluginPageState(pageId: string): PluginTabState | undefined {
  return usePluginTabState(PLUGIN_PAGE_SCOPE, pageId);
}

/**
 * Shows the page's last stored view until its open answers. Only a page with
 * nothing on screen takes it: a live view is never replaced by an older one.
 */
export function seedPluginPage(
  pageId: string,
  seed: { surfaces: A2UISurface[]; owner?: A2UISurfaceOwner; contextSessionId?: string },
): void {
  const entry = key(PLUGIN_PAGE_SCOPE, pageId);
  usePluginTabStore.setState((store) => {
    if (store.tabs[entry] || seed.surfaces.length === 0) return store;
    return {
      tabs: {
        ...store.tabs,
        [entry]: {
          status: 'loading',
          surfaces: seed.surfaces.map((surface) => owned(surface, seed.owner)),
          revision: 0,
          stale: false,
          owner: seed.owner,
          contextSessionId: seed.contextSessionId,
          stored: true,
        },
      },
    };
  });
}

/** Reads the page's resource in its context; the first open creates the context. */
export function openPluginPage(
  repository: PluginPageRepository,
  pageId: string,
  options: { retry?: boolean } = {},
): Promise<void> {
  return openPluginTab(pageRoutes(repository), PLUGIN_PAGE_SCOPE, pageId, options);
}

/** The person stopped waiting for the page to open. */
export function cancelPluginPageOpen(pageId: string): void {
  cancelPluginTabOpen(PLUGIN_PAGE_SCOPE, pageId);
}

/** The page left the screen: forget its surfaces and tell the service. */
export function releasePluginPage(pageId: string): void {
  releasePluginTab(PLUGIN_PAGE_SCOPE, pageId);
}

/** After a reconnect or a gap on the context's stream, read every open page again. */
export function rereadPluginPages(): void {
  rereadPluginTabs(PLUGIN_PAGE_SCOPE);
}
