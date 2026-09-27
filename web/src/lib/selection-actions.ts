import type { LucideIcon } from 'lucide-react';

/**
 * What a person selected, and where. One discriminated union carries every
 * surface a selection can come from, so one action registry and one toolbar
 * serve all of them.
 *
 * Only `agent-answer-text` is produced today. The shapes the registry is
 * designed to carry next are selections of document or artifact text, a region
 * of an image (for visual models), and a node of an A2UI or MCP app surface;
 * each will be a new member here plus the surface that produces it. Actions
 * declare which kinds they apply to, so adding a kind never changes an action
 * that does not handle it.
 */
export type SelectionTarget = AgentAnswerTextSelection;

/** A contiguous run of text inside one agent answer in the transcript. */
export interface AgentAnswerTextSelection {
  kind: 'agent-answer-text';
  /** The selected text, exactly as rendered. */
  text: string;
  /** The session whose transcript holds the answer. */
  sessionId: string;
  /** The answer message the text belongs to. */
  messageId: string;
}

export type SelectionTargetKind = SelectionTarget['kind'];

/** One thing a person can do with a selection (Add to chat, More details, ...). */
export interface SelectionAction {
  /** Stable id; registering the same id again replaces the earlier action. */
  id: string;
  label: string;
  icon: LucideIcon;
  /** Lower sorts first in the toolbar. */
  order: number;
  /** The selection kinds this action handles. */
  kinds: readonly SelectionTargetKind[];
  /** Further narrowing for one selection (e.g. only when a session is open). */
  isAvailable?: (target: SelectionTarget) => boolean;
  run: (target: SelectionTarget) => void;
}

/** The set of selection actions currently offered, owned by one provider. */
export interface SelectionActionRegistry {
  /** Add (or replace by id) an action; returns the matching unregister. */
  register: (action: SelectionAction) => () => void;
  /** The actions that apply to `target`, in toolbar order. */
  actionsFor: (target: SelectionTarget) => SelectionAction[];
  /** Notify when the registered set changes. */
  subscribe: (listener: () => void) => () => void;
}

export function createSelectionActionRegistry(): SelectionActionRegistry {
  const actions = new Map<string, SelectionAction>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    register(action) {
      actions.set(action.id, action);
      notify();
      return () => {
        if (actions.get(action.id) === action) {
          actions.delete(action.id);
          notify();
        }
      };
    },
    actionsFor(target) {
      return [...actions.values()]
        .filter(
          (action) => action.kinds.includes(target.kind) && (action.isAvailable?.(target) ?? true),
        )
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Read the agent-answer text selection a DOM selection represents, or nothing.
 *
 * A selection qualifies only when it lies entirely inside the text of ONE agent
 * answer (`data-slot="message-text"` under a `data-selection-surface=
 * "agent-answer"` row that names its session and message): a drag that crosses
 * into a tool card, the composer, or another message is not a statement about
 * one answer, so no toolbar is offered for it.
 */
export function agentAnswerSelection(
  selection: Selection | null,
): AgentAnswerTextSelection | undefined {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const text = selection.toString().trim();
  if (!text) return undefined;
  const range = selection.getRangeAt(0);
  const textBlock = elementOf(range.startContainer)?.closest('[data-slot="message-text"]');
  if (
    !textBlock ||
    textBlock !== elementOf(range.endContainer)?.closest('[data-slot="message-text"]')
  ) {
    return undefined;
  }
  const surface = textBlock.closest<HTMLElement>('[data-selection-surface="agent-answer"]');
  const sessionId = surface?.dataset.sessionId ?? '';
  const messageId = surface?.dataset.messageId ?? '';
  if (!surface || !sessionId || !messageId) return undefined;
  return { kind: 'agent-answer-text', text, sessionId, messageId };
}

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}
