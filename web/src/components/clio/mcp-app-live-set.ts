import {
  decodeEventEnvelope,
  type ClioRepository,
  type McpAppIdentity,
  type Message,
} from '@clio/core/v3';
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { humanizeToolName } from './tool-presentation';
import type { McpAppTabTarget } from './workbench-shared';

/**
 * Where an App's one frame is (MA3): its card in the conversation, a workbench
 * tab, or an A2UI surface. `ended` is an App that was closed.
 */
export type McpAppPlacement = 'inline' | 'tab' | 'surface' | 'ended';

type LiveSetRepository = Pick<ClioRepository, 'closeMcpApp' | 'setMcpAppDisplayMode' | 'pinMcpApp'>;

export interface McpAppLiveEntry extends McpAppTabTarget {
  placement: McpAppPlacement;
  repository?: LiveSetRepository;
  /** The server no longer has the record (404); its tab stays to say so. */
  gone?: boolean;
  /**
   * The transcript card this App was reopened from (MA19). A reopened view stands in
   * for its card: when that card is the conversation's latest, so is the view.
   */
  card?: string;
}

interface McpAppLiveSetState {
  apps: Record<string, McpAppLiveEntry>;
  /** Per session, the latest App in the transcript: the only live inline App. */
  latest: Record<string, string>;
}

/**
 * The session-level live set (MA5): the latest inline App in each conversation,
 * every App in a tab, and every App in a visible A2UI surface. A newer inline
 * App closes the previous inline App; it never closes an App in a tab or a surface.
 */
export const useMcpAppLiveSetStore = create<McpAppLiveSetState>(() => ({ apps: {}, latest: {} }));

/** Asks the page to open (or focus) an App's tab; `use-workbench-navigation` reveals it. */
export const OPEN_MCP_APP_TAB_EVENT = 'clio:open-mcp-app-tab';

export function mcpAppIdentity(entry: McpAppTabTarget): McpAppIdentity {
  return {
    sessionId: entry.sessionId,
    appInstanceId: entry.appInstanceId,
    dataRef: entry.dataRef,
  };
}

export function mcpAppLabel(toolName: string, sourceServer: string, title?: string): string {
  return title?.trim() || humanizeToolName(toolName || sourceServer || 'interactive_tool');
}

function update(id: string, patch: Partial<McpAppLiveEntry>): void {
  useMcpAppLiveSetStore.setState((state) => {
    const current = state.apps[id];
    if (!current) return state;
    return { apps: { ...state.apps, [id]: { ...current, ...patch } } };
  });
}

/** Add an App the page knows about; an existing entry keeps its placement. */
export function noteMcpApp(
  target: McpAppTabTarget,
  repository: LiveSetRepository | undefined,
  placement: McpAppPlacement = 'inline',
): McpAppLiveEntry {
  const existing = useMcpAppLiveSetStore.getState().apps[target.appInstanceId];
  if (existing) {
    if (repository && !existing.repository) update(target.appInstanceId, { repository });
    return existing;
  }
  const entry: McpAppLiveEntry = { ...target, placement, repository };
  useMcpAppLiveSetStore.setState((state) => ({
    apps: { ...state.apps, [target.appInstanceId]: entry },
  }));
  return entry;
}

function closeOnServer(entry: McpAppLiveEntry): void {
  update(entry.appInstanceId, { placement: 'ended' });
  // A 404 means the server already closed it; there is nothing else to settle.
  void entry.repository?.closeMcpApp(mcpAppIdentity(entry)).catch(() => undefined);
}

function isLatestIn(state: McpAppLiveSetState, entry: McpAppLiveEntry): boolean {
  const latest = state.latest[entry.sessionId];
  return latest === entry.appInstanceId || (entry.card !== undefined && latest === entry.card);
}

function isLatest(entry: McpAppLiveEntry): boolean {
  return isLatestIn(useMcpAppLiveSetStore.getState(), entry);
}

/** A view reopened from a transcript card stands in for that card (MA19). */
export function standInForCard(appInstanceId: string, card: string): void {
  const entry = useMcpAppLiveSetStore.getState().apps[appInstanceId];
  if (entry && entry.card !== card && appInstanceId !== card) update(appInstanceId, { card });
}

function requestTab(entry: McpAppTabTarget): void {
  window.dispatchEvent(
    new CustomEvent<McpAppTabTarget>(OPEN_MCP_APP_TAB_EVENT, {
      detail: {
        label: entry.label,
        appInstanceId: entry.appInstanceId,
        dataRef: entry.dataRef,
        sessionId: entry.sessionId,
        resourceUri: entry.resourceUri,
        sourceServer: entry.sourceServer,
        toolName: entry.toolName,
      },
    }),
  );
}

/** Move an App into its tab (MA2): the card's frame unmounts and the tab's mounts. */
export function openMcpAppInTab(target: McpAppTabTarget, repository?: LiveSetRepository): void {
  const entry = noteMcpApp(target, repository);
  if (entry.placement === 'ended') return;
  update(target.appInstanceId, { placement: 'tab' });
  void (entry.repository ?? repository)
    ?.setMcpAppDisplayMode(mcpAppIdentity(entry), 'fullscreen')
    .catch(() => undefined);
  requestTab(entry);
}

/** Focus an App's tab, opening it when the workbench lost it (a reload, another window). */
export function focusMcpAppTab(target: McpAppTabTarget): void {
  requestTab(target);
}

/**
 * The tab leaves (Return to conversation, the tab closed, or the view asked for
 * `inline`). The latest App in its conversation goes back to its card; an older
 * one has no live card to return to, so it is closed (MA7).
 */
export function returnMcpAppToConversation(appInstanceId: string): void {
  const entry = useMcpAppLiveSetStore.getState().apps[appInstanceId];
  if (!entry || entry.placement !== 'tab') return;
  if (!isLatest(entry)) {
    closeOnServer(entry);
    return;
  }
  update(appInstanceId, { placement: 'inline' });
  void entry.repository
    ?.setMcpAppDisplayMode(mcpAppIdentity(entry), 'inline')
    .catch(() => undefined);
}

/** Whether "Return to conversation" puts the App back in a card (it is the latest). */
export function mcpAppCanReturn(appInstanceId: string): boolean {
  const entry = useMcpAppLiveSetStore.getState().apps[appInstanceId];
  return Boolean(entry && isLatest(entry));
}

/**
 * A tab the workbench restored holds its App's frame (MA19), so it claims the App
 * before the transcript notes it as inline. Without the claim, a restored tab of a
 * transcript App (not a reopened one) read as "left" and closed at once, and the
 * latest card asked the service, found the view gone after a restart and ended it.
 */
export function claimRestoredMcpAppTab(target: McpAppTabTarget): void {
  const entry = noteMcpApp(target, undefined, 'tab');
  if (entry.placement === 'inline') update(target.appInstanceId, { placement: 'tab' });
}

/** A frame found the record already in its tab (the descriptor says `fullscreen`). */
export function adoptMcpAppTab(appInstanceId: string): void {
  const entry = useMcpAppLiveSetStore.getState().apps[appInstanceId];
  if (entry && entry.placement === 'inline') update(appInstanceId, { placement: 'tab' });
}

/** The session event CLIO publishes when it closes an App itself (reaped server, cleanup). */
export const MCP_APP_CLOSED_EVENT = 'mcp_app_closed';

/** A streamed `mcp_app_closed`: the App ended on the server; its card offers Reopen. */
export function dispatchMcpAppClosedFrame(frame: { eventName?: string; data: unknown }): void {
  if (frame.eventName !== MCP_APP_CLOSED_EVENT) return;
  let payload: unknown;
  try {
    payload = decodeEventEnvelope(frame.data).payload;
  } catch {
    return; // Frame reduction owns malformed-envelope reporting.
  }
  const id = (payload as { app_instance_id?: unknown } | null)?.app_instance_id;
  if (typeof id === 'string' && useMcpAppLiveSetStore.getState().apps[id]) markMcpAppEnded(id);
}

/** A frame found the record gone (404): the App ended on the server. */
export function markMcpAppEnded(appInstanceId: string): void {
  update(appInstanceId, { placement: 'ended', gone: true });
}

/** Whether CLIO closed the App: its close already withdrew the App's own tools (MA7). */
export function mcpAppEnded(appInstanceId: string): boolean {
  return useMcpAppLiveSetStore.getState().apps[appInstanceId]?.placement === 'ended';
}

/** Whether an App's tab should close: its frame moved back or the host closed it. */
export function mcpAppTabLeft(appInstanceId: string): boolean {
  const entry = useMcpAppLiveSetStore.getState().apps[appInstanceId];
  return Boolean(entry && entry.placement !== 'tab' && !entry.gone);
}

/** An A2UI surface mounts the App (MA20): the record is pinned while it stays (MA6). */
export function registerMcpAppSurface(
  target: McpAppTabTarget,
  repository: LiveSetRepository,
): void {
  noteMcpApp(target, repository, 'surface');
  update(target.appInstanceId, { placement: 'surface', repository });
  void repository.pinMcpApp(mcpAppIdentity(target), true).catch(() => undefined);
}

/** The surface unmounts: the App closes through the existing close path (MA7). */
export function releaseMcpAppSurface(appInstanceId: string): void {
  const entry = useMcpAppLiveSetStore.getState().apps[appInstanceId];
  if (entry?.placement === 'surface') closeOnServer(entry);
}

interface TranscriptApp extends McpAppTabTarget {
  messageIndex: number;
}

function transcriptApps(messages: readonly Message[]): TranscriptApp[] {
  const apps: TranscriptApp[] = [];
  messages.forEach((message, messageIndex) => {
    for (const block of message.blocks) {
      if (block.type !== 'mcp_app') continue;
      apps.push({
        messageIndex,
        label: mcpAppLabel(block.tool_name, block.source_server, block.title),
        appInstanceId: block.app_instance_id,
        dataRef: block.data_ref,
        sessionId: message.session_id,
        resourceUri: block.resource_uri,
        sourceServer: block.source_server,
        toolName: block.tool_name,
      });
    }
  });
  return apps;
}

/**
 * Keep a conversation's part of the live set: every App in the transcript is
 * known, the latest is the live inline App, and when a newer App takes that
 * place the previous one is closed unless it is in a tab or a surface.
 */
export function useMcpAppLiveSet(
  sessionId: string | undefined,
  messages: readonly Message[],
  repository: LiveSetRepository | undefined,
): void {
  const apps = useMemo(() => transcriptApps(messages), [messages]);
  const latestKey = apps.at(-1)?.appInstanceId;
  const session = sessionId ?? apps.at(-1)?.sessionId;
  useEffect(() => {
    if (!session) return;
    const sessionId = session;
    for (const app of apps) noteMcpApp(app, repository);
    const state = useMcpAppLiveSetStore.getState();
    const previousId = state.latest[sessionId];
    if (previousId === latestKey) return;
    useMcpAppLiveSetStore.setState((current) => {
      const latest = { ...current.latest };
      if (latestKey) latest[sessionId] = latestKey;
      else delete latest[sessionId];
      return { latest };
    });
    const previous = previousId ? state.apps[previousId] : undefined;
    if (previous?.placement === 'inline') closeOnServer(previous);
    // A view reopened from the previous latest card is that card's inline App too (MA5).
    if (previousId) {
      for (const entry of Object.values(state.apps)) {
        if (entry.card === previousId && entry.placement === 'inline') closeOnServer(entry);
      }
    }
  }, [apps, latestKey, repository, session]);
}

/** What a card shows: the App's placement and whether it is its conversation's latest. */
export function useMcpAppPresence(appInstanceId: string, sessionId: string) {
  const placement = useMcpAppLiveSetStore((state) => state.apps[appInstanceId]?.placement);
  const latest = useMcpAppLiveSetStore((state) => {
    const entry = state.apps[appInstanceId];
    return entry ? isLatestIn(state, entry) : state.latest[sessionId] === appInstanceId;
  });
  return { placement: placement ?? 'inline', latest };
}

/** Apps whose card shows something live: each conversation's latest App and every App in a tab. */
export function useShownMcpAppIds(): ReadonlySet<string> {
  const key = useMcpAppLiveSetStore((state) =>
    [
      ...Object.values(state.latest),
      ...Object.values(state.apps)
        .filter((entry) => entry.placement === 'tab' || (entry.card && isLatestIn(state, entry)))
        .map((entry) => entry.appInstanceId),
    ]
      .sort()
      .join('\n'),
  );
  return useMemo(() => new Set(key ? key.split('\n') : []), [key]);
}

/** Test seam: forget every App. */
export function resetMcpAppLiveSet(): void {
  useMcpAppLiveSetStore.setState({ apps: {}, latest: {} });
}
