import type { Message, Task, ToolInvocation } from '@clio/core/v3';
import {
  conversationTurnPresentation,
  type ConversationTurnPresentation,
} from './conversation-turn-model';

interface LiveActivityOptions {
  messages: readonly Message[];
  activeTurnId?: string;
  sessionState?: string;
  presentations: ReadonlyMap<string, ConversationTurnPresentation>;
  tools: Record<string, ToolInvocation>;
  tasks: Record<string, Task>;
  feedback: ReadonlyMap<string, readonly Message[]>;
  injections: ReadonlyMap<string, readonly Message[]>;
}

/** Follow only the latest visible live activity, including work joined into an earlier row. */
export function liveActivityIterationId({
  messages,
  activeTurnId,
  sessionState,
  presentations,
  tools,
  tasks,
  feedback,
  injections,
}: LiveActivityOptions): string | undefined {
  if (
    !activeTurnId ||
    !['running', 'queued', 'waiting_permission', 'waiting_user'].includes(sessionState ?? '')
  )
    return;
  const liveIds = messages
    .filter(
      (message) =>
        message.role === 'assistant' && (message.run_id ?? message.turn_id) === activeTurnId,
    )
    .map((message) => message.id);
  if (!liveIds.length) return;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    let view = presentations.get(message.id);
    if (
      !liveIds.includes(message.id) &&
      !view?.iterations.some((iteration) =>
        liveIds.some((id) => iteration.id.startsWith(`${id}:iteration:`)),
      )
    )
      continue;
    view ??= conversationTurnPresentation(
      message,
      tools,
      tasks,
      feedback.get(message.id),
      injections.get(message.id),
    );
    const tail = view.segments.at(-1);
    if (!tail) continue;
    // Public text, a question response, an artifact, or another visible entry
    // takes focus from the preceding automatically opened tool group.
    if (tail.kind !== 'iterations') return;
    const start = tail.iterations.findLastIndex((iteration) => iteration.nextThoughts.length > 0);
    const group = tail.iterations.slice(Math.max(0, start));
    return group.some((iteration) => iteration.activity.length > 0) ? group[0]?.id : undefined;
  }
}

/** Show one terminal return per child run, keeping its latest recorded position. */
export function foldSubagentReturns(messages: readonly Message[]): Message[] {
  const returned = new Set<string>();
  return messages
    .toReversed()
    .map((message) => {
      const blocks = message.blocks
        .toReversed()
        .filter((block) => {
          if (
            block.type !== 'subagent' ||
            !block.stage ||
            ['delegate.started', 'delegate.superseded'].includes(block.stage)
          )
            return true;
          const key = `${message.session_id}\u0000${block.subagent_id}\u0000${block.stage}`;
          if (returned.has(key)) return false;
          returned.add(key);
          return true;
        })
        .reverse();
      return blocks.length === message.blocks.length ? message : { ...message, blocks };
    })
    .reverse();
}

/** Join adjacent operations across internal turns without moving public answer text. */
export function placeContinuedActivity(
  messages: readonly Message[],
  continuations: ReadonlySet<string>,
  tools: Record<string, ToolInvocation>,
  tasks: Record<string, Task>,
  feedback: ReadonlyMap<string, readonly Message[]>,
  injections: ReadonlyMap<string, readonly Message[]>,
  boundaries: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, ConversationTurnPresentation> {
  const presentations = new Map<string, ConversationTurnPresentation>();
  const presentation = (message: Message) =>
    presentations.get(message.id) ??
    conversationTurnPresentation(
      message,
      tools,
      tasks,
      feedback.get(message.id),
      injections.get(message.id),
    );
  let previous: Message | undefined;
  // The owner remains at the first visible activity position while subsequent
  // internal turns stream into its disclosure. Original message/part ids remain
  // available for reasoning provenance, raw inspection, and transcript anchors.
  let owner: Message | undefined;
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    if (
      previous &&
      continuations.has(message.id) &&
      !feedback.has(previous.id) &&
      !feedback.has(message.id) &&
      !boundaries.has(previous.id) &&
      !boundaries.has(message.id)
    ) {
      const target = owner ?? previous;
      const before = presentation(target);
      const after = presentation(message);
      const trailing = before.segments.at(-1);
      const leading = after.segments[0];
      if (
        trailing?.kind === 'iterations' &&
        leading?.kind === 'iterations' &&
        !leading.iterations[0]?.nextThoughts.length &&
        !trailing.iterations.some((iteration) => iteration.interrupted)
      ) {
        const joined = {
          kind: 'iterations' as const,
          iterations: [...trailing.iterations, ...leading.iterations],
        };
        const beforeSegments = [...before.segments.slice(0, -1), joined];
        const afterSegments = after.segments.slice(1);
        presentations.set(target.id, {
          ...before,
          segments: beforeSegments,
          iterations: beforeSegments.flatMap((segment) =>
            segment.kind === 'iterations' ? segment.iterations : [],
          ),
        });
        presentations.set(message.id, {
          ...after,
          segments: afterSegments,
          iterations: afterSegments.flatMap((segment) =>
            segment.kind === 'iterations' ? segment.iterations : [],
          ),
        });
        owner = afterSegments.length ? message : target;
      } else owner = message;
    } else owner = message;
    previous = message;
  }
  return presentations;
}
