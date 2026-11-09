import type {
  CommentAttachment,
  CommentSurfaceKind,
  ComposerMessagePart,
  DocumentAnchor,
} from '@clio/core/v3';
import type { SelectionTarget } from './selection-actions';

/**
 * What the person attaches to their next message: comment sessions on things that are not
 * versioned artifacts (comments plan, "Stored threads or attachments"). A quoted run of an
 * agent answer, a chart or map zone, and an A2UI region capture are all marks of a session,
 * labelled `S1`, `S2` and onward, with the same anchor model as a comment on a document.
 * They travel as one `comment_session` part each; the service renders what the agent reads.
 */

const LABEL = /^S([1-9][0-9]{0,3})$/u;

function nextLabel(session: CommentAttachment | undefined): string {
  let highest = 0;
  for (const mark of session?.marks ?? []) {
    const match = LABEL.exec(mark.label);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `S${highest + 1}`;
}

/**
 * Add one mark to the session for its surface (the same answer, the same surface zone's
 * title), starting a session when there is none.
 */
export function withMark(
  sessions: readonly CommentAttachment[],
  kind: CommentSurfaceKind,
  title: string,
  anchor: DocumentAnchor,
  comment = '',
): CommentAttachment[] {
  const index = sessions.findIndex((session) => session.kind === kind && session.title === title);
  const current = index >= 0 ? sessions[index] : undefined;
  const mark = { label: nextLabel(current), anchor, comment };
  const updated: CommentAttachment = current
    ? { ...current, marks: [...current.marks, mark] }
    : { kind, title, marks: [mark] };
  return index >= 0
    ? sessions.map((session, at) => (at === index ? updated : session))
    : [...sessions, updated];
}

/** The mark "Add to chat" or "Reference this" makes from a selection. */
export function markFromSelection(target: SelectionTarget): {
  kind: CommentSurfaceKind;
  title: string;
  anchor: DocumentAnchor;
} {
  if (target.kind === 'data-surface-zone') {
    return {
      kind: 'a2ui-surface',
      title: target.title,
      anchor: {
        profile: 'dom',
        tag: 'zone',
        text_excerpt: target.summary,
        source: {
          zone: target.summary,
          under: target.markdown.split(/\r?\n/u).filter((line) => line.trim()),
        },
      },
    };
  }
  if (target.kind === 'file-text') {
    // A file passage, quoted with its path and lines; the wire has no file kind yet.
    return { kind: 'a2ui-surface', title: target.path, anchor: target.anchor };
  }
  const { messageId, sessionId } =
    target.kind === 'transcript-content'
      ? { messageId: target.reference.message_id, sessionId: target.reference.session_id }
      : target;
  return {
    kind: 'agent-answer',
    title: messageId ? `answer ${messageId}` : 'an answer',
    anchor: {
      profile: 'text-quote',
      exact: target.text,
      source: { message_id: messageId, session_id: sessionId },
    },
  };
}

/** The message parts that carry the attached sessions. */
export function commentSessionParts(
  sessions: readonly CommentAttachment[],
): Extract<ComposerMessagePart, { type: 'comment_session' }>[] {
  return sessions
    .filter((session) => session.marks.length > 0)
    .map((session) => ({ type: 'comment_session', metadata: { comment_session: session } }));
}

/** A short line for a session's chip: its target and its marks. */
export function commentSessionSummary(session: CommentAttachment): string {
  const marks = session.marks.map((mark) => mark.label).join(', ');
  return `${session.title || session.kind}: ${marks}`;
}
