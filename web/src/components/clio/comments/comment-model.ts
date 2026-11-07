import type {
  CommentAttachment,
  CommentMode,
  CommentSurfaceKind,
  DocumentAnchor,
} from '@clio/core/v3';

/**
 * One select session on one surface (comments plan, addendum A section 1): numbered marks
 * (`S1`, `S2`, ...) each with its own comment, sent together. On an artifact the session
 * becomes stored threads; elsewhere it attaches to the next message.
 */

/** One mark the person made, before it is sent. */
export interface DraftMark {
  label: string;
  mode: CommentMode;
  anchor: DocumentAnchor;
  comment: string;
  sendToAgent: boolean;
  /** A few words the list shows for the mark (its text, or the element it picked). */
  preview: string;
  /** Where the mark was made on screen, so its editor opens beside it. */
  box?: { left: number; top: number; width: number; height: number };
  /** A region's box normalized to the viewer it was drawn on, to draw it there again. */
  view?: [number, number, number, number];
  /** The viewer the mark was made on, so it is drawn there and not on a pane beside it. */
  viewer?: string;
}

/** Where a new mark sits, besides its anchor. */
export interface MarkPlace {
  preview?: string;
  box?: DraftMark['box'];
  view?: DraftMark['view'];
  viewer?: DraftMark['viewer'];
}

/** Where a session's marks go when they are sent. */
export type CommentDestination =
  | {
      kind: 'artifact';
      sessionId: string;
      artifactId: string;
      version: number;
      sha256: string;
    }
  | { kind: 'attachment'; surface: CommentSurfaceKind };

/** What a surface tells the shared session about itself. */
export interface CommentSurface {
  title: string;
  modes: readonly CommentMode[];
  defaultMode: CommentMode;
  destination: CommentDestination;
}

export const MODE_LABELS: Record<CommentMode, string> = {
  text: 'Text',
  region: 'Region',
  element: 'Element',
};

const LABEL = /^S([1-9][0-9]{0,3})$/u;

/** `7` for `S7`; `0` for anything else. */
export function labelNumber(label: string | undefined): number {
  const match = LABEL.exec(label ?? '');
  return match ? Number(match[1]) : 0;
}

/** The label after every label already used. */
export function nextLabel(used: Iterable<string | undefined>, floor = 1): string {
  let highest = floor - 1;
  for (const label of used) highest = Math.max(highest, labelNumber(label));
  return `S${highest + 1}`;
}

/** The mode a stored anchor was made in. */
export function anchorMode(anchor: DocumentAnchor): CommentMode {
  if (anchor.profile === 'region') return 'region';
  if (anchor.profile === 'dom') return 'element';
  return 'text';
}

/** A short line for the list: the selected text, the element, or the box. */
export function anchorPreview(anchor: DocumentAnchor): string {
  if (anchor.exact) return `“${anchor.exact.slice(0, 80)}”`;
  if (anchor.profile === 'dom' && anchor.tag === 'zone' && anchor.text_excerpt)
    return anchor.text_excerpt;
  if (anchor.profile === 'dom')
    return `<${anchor.tag || 'element'}> ${anchor.selector ?? ''}`.trim();
  if (anchor.rect?.length === 4) {
    const [x, y, w, h] = anchor.rect;
    const page = anchor.page_index !== undefined ? `page ${anchor.page_index + 1}, ` : '';
    return `${page}x ${Math.round(x * 100)}–${Math.round((x + w) * 100)}%, y ${Math.round(y * 100)}–${Math.round((y + h) * 100)}%`;
  }
  return anchor.profile;
}

/** Ask the composer to attach a session to the next message. */
export const ADD_COMMENT_SESSION_EVENT = 'clio:add-comment-session';

export function attachCommentSession(attachment: CommentAttachment): void {
  window.dispatchEvent(new CustomEvent(ADD_COMMENT_SESSION_EVENT, { detail: attachment }));
}
