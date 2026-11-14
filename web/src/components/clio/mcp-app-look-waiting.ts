import { useSyncExternalStore } from 'react';
import type { McpAppPlacementKind } from './mcp-app-bridge';
import { focusMcpAppTab, mcpAppLabel } from './mcp-app-live-set';
import type { McpAppTabTarget } from './workbench-shared';

/**
 * The agent's looks that wait on a view the person cannot see (DOCS-F2).
 *
 * A look (`look_at_view`) asks the mount holding the view for a snapshot and waits for it
 * with no timeout (rule 6). A browser does not draw a frame that is off screen (a card
 * scrolled away, a tab behind another), so the snapshot, and with it the agent, waits
 * until the person shows the view. While a snapshot is in progress its mount is listed
 * here with whether its frame is on screen; the waiting tool row and the view's card read
 * the list and say in words that the agent is waiting to see the view, with a way to show it.
 */

export interface WaitingViewLook {
  callId: string;
  sessionId: string;
  appInstanceId: string;
  /** Whether any part of the view's frame is on screen. */
  visible: boolean;
  /** Bring the view on screen: scroll its card into view, or show its tab. */
  reveal: () => void;
}

let looks: readonly WaitingViewLook[] = [];
const listeners = new Set<() => void>();

function publish(next: readonly WaitingViewLook[]): void {
  looks = next;
  for (const listener of listeners) listener();
}

function patch(callId: string, change: Partial<WaitingViewLook>): void {
  if (!looks.some((look) => look.callId === callId)) return;
  publish(looks.map((look) => (look.callId === callId ? { ...look, ...change } : look)));
}

/**
 * A mount began a snapshot for a look: list it, follow whether its frame is on screen,
 * and return the call that lists it no more (the snapshot answered or failed).
 */
export function trackViewLook(
  look: Omit<WaitingViewLook, 'visible'>,
  frame: Element | null | undefined,
): () => void {
  const observerType = (globalThis as { IntersectionObserver?: typeof IntersectionObserver })
    .IntersectionObserver;
  // Without a frame or an observer nothing can tell; the look is not said to be hidden.
  publish([...looks.filter((row) => row.callId !== look.callId), { ...look, visible: true }]);
  let observer: IntersectionObserver | undefined;
  if (frame && observerType) {
    observer = new observerType((entries) => {
      const entry = entries.at(-1);
      if (entry) patch(look.callId, { visible: entry.isIntersecting });
    });
    observer.observe(frame);
  }
  return () => {
    observer?.disconnect();
    if (looks.some((row) => row.callId === look.callId))
      publish(looks.filter((row) => row.callId !== look.callId));
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The newest look that waits on a view not on screen: of this conversation, or of this
 * view. `undefined` when no look waits on a hidden view (or `scope` is undefined).
 */
export function useWaitingViewLook(
  scope: { sessionId?: string; appInstanceId?: string } | undefined,
): WaitingViewLook | undefined {
  const all = useSyncExternalStore(
    subscribe,
    () => looks,
    () => looks,
  );
  if (!scope) return undefined;
  return all.findLast(
    (look) =>
      !look.visible &&
      (!scope.sessionId || look.sessionId === scope.sessionId) &&
      (!scope.appInstanceId || look.appInstanceId === scope.appInstanceId),
  );
}

/**
 * Bring a view on screen so the agent's look can see it (DOCS-F2): a view in a tab shows
 * its tab; a view in a card or a surface scrolls into view (at once under reduced motion).
 */
export function revealView(
  placement: McpAppPlacementKind,
  frame: Element | null,
  target: Omit<McpAppTabTarget, 'label'> & { label?: string },
): void {
  if (placement === 'tab') {
    focusMcpAppTab({
      ...target,
      label: target.label || mcpAppLabel(target.toolName, target.sourceServer),
    });
    return;
  }
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  frame?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
}

/** Tests only: forget every listed look. */
export function resetWaitingViewLooks(): void {
  publish([]);
}
