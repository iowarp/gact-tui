import type { Message, SessionAgentTask, SessionMessageEvent } from '@clio/core';

/**
 * Live child-preview accumulation (P4R prototype rule): while a delegation
 * runs, its Call box streams the CHILD's own SSE wire into the running card
 * instead of sitting empty. Children are real sessions with their own
 * message-lifecycle stream, so this is rendering the child's own wire, not a
 * client-side fabrication — pure reducers here apply exactly what the event
 * carries, with only a presentation-side tail cap, never a reshape.
 */

/** Presentation-only cap on the live preview tail — the wire itself is never
 *  truncated or mutated; this is what the running Call box shows. */
export const CHILD_PREVIEW_TAIL_CHARS = 600;

/** Hard cap on concurrent child-session SSE subscriptions a session view may
 *  hold open for live previews, independent of how many delegations happen
 *  to be running at once. */
export const CHILD_PREVIEW_MAX_CONCURRENT = 4;

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

/** Accumulates ONE child session's streamed text into a rolling tail. */
export interface ChildPreviewAccumulator {
  /** The text part id currently tracked; a fresh `text` part.added/updated
   *  switches tracking to it — the box always shows the LATEST prose, never
   *  a stale part left over from an earlier tool call in the same run. */
  partId?: string;
  /** Rolling tail of that part's text, capped at CHILD_PREVIEW_TAIL_CHARS. */
  text: string;
}

export const EMPTY_CHILD_PREVIEW: ChildPreviewAccumulator = { text: '' };

function tail(text: string): string {
  return text.length > CHILD_PREVIEW_TAIL_CHARS
    ? text.slice(text.length - CHILD_PREVIEW_TAIL_CHARS)
    : text;
}

/**
 * Pure reducer: applies ONE child-session message-lifecycle event to the
 * running preview accumulator. Only `text` parts feed the preview — a
 * `thinking` or `tool_call` part mid-stream would misrepresent the child's
 * prose (or leak raw tool payloads into a box the prototype specs as a text
 * preview). This performs no dedup and no reshaping of the wire's own
 * `text_append`/`final_text` values, only a presentation-side tail cap after
 * applying them (owner rule: the wire renders verbatim).
 */
export function applyChildPreviewEvent(
  state: ChildPreviewAccumulator,
  event: Pick<SessionMessageEvent, 'type' | 'payload'>,
): ChildPreviewAccumulator {
  switch (event.type) {
    case 'message.part.added':
    case 'message.part.updated': {
      const part = event.payload['part'] as
        | { id?: unknown; type?: unknown; text?: unknown }
        | undefined;
      if (!part || part.type !== 'text' || typeof part.id !== 'string') return state;
      return { partId: part.id, text: tail(str(part.text)) };
    }
    case 'message.part.delta': {
      const partId = event.payload['part_id'];
      if (typeof partId !== 'string' || partId !== state.partId) return state;
      const delta = event.payload['delta'] as { text_append?: unknown } | undefined;
      const append = delta?.text_append;
      if (typeof append !== 'string' || !append) return state;
      return { partId, text: tail(state.text + append) };
    }
    case 'message.part.completed': {
      const partId = event.payload['part_id'];
      if (typeof partId !== 'string' || partId !== state.partId) return state;
      const finalText = event.payload['final_text'];
      if (typeof finalText !== 'string') return state;
      return { partId, text: tail(finalText) };
    }
    default:
      return state;
  }
}

/**
 * Scans a loaded transcript for delegations still RUNNING — stage
 * `delegate.started`, the same test HandoffPart/MergedHandoff already use to
 * decide a box is unsettled — and returns their handle ids, in transcript
 * order. Duplicates (the same handle appearing twice) are collapsed.
 */
export function selectRunningHandoffHandles(messages: Message[]): string[] {
  const seen = new Set<string>();
  const handles: string[] = [];
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      const p = part as unknown as Record<string, unknown>;
      if (p['type'] !== 'expert_handoff') continue;
      if (str(p['stage']) !== 'delegate.started') continue;
      const handleId = str(p['handle_id']);
      if (!handleId || seen.has(handleId)) continue;
      seen.add(handleId);
      handles.push(handleId);
    }
  }
  return handles;
}

/** Finds the agent-task row backing one delegation's handle id. Tolerates
 *  the `id`-vs-`task_id` compatibility alias carried by SessionAgentTask. */
export function findAgentTaskByHandle(
  tasks: SessionAgentTask[],
  handleId: string,
): SessionAgentTask | undefined {
  return tasks.find((task) => task.task_id === handleId || task.id === handleId);
}

/**
 * Given the delegations currently running and the handles that ALREADY hold
 * an open child subscription, returns which additional handles may open one.
 * Existing subscriptions are never displaced, and the combined total never
 * exceeds `maxConcurrent` — a running box past the cap simply keeps showing
 * no preview, never a fabricated one.
 */
export function selectSubscriptionSlots(
  runningHandleIds: readonly string[],
  openHandleIds: ReadonlySet<string>,
  maxConcurrent: number = CHILD_PREVIEW_MAX_CONCURRENT,
): string[] {
  let free = Math.max(0, maxConcurrent - openHandleIds.size);
  const next: string[] = [];
  for (const handleId of runningHandleIds) {
    if (free <= 0) break;
    if (openHandleIds.has(handleId)) continue;
    next.push(handleId);
    free -= 1;
  }
  return next;
}
