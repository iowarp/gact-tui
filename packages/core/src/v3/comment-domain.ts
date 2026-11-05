import type { ArtifactReview, DocumentAnchor } from './document-domain.js';

/**
 * Comments and visual feedback: one select session of numbered marks (`S1`, `S2`, ...)
 * per send. On an artifact the marks become threads bound to its version; on anything
 * else (an agent answer, an A2UI surface, a browser page) they travel as one
 * `comment_session` part of the next message.
 */

/** How one mark points at its target. */
export type CommentMode = 'text' | 'region' | 'element';

export type CommentThreadStatus = ArtifactReview['status'];

export type ThreadAnchorState = 'current' | 'moved' | 'outdated';

/** One mark the person made, before it is sent. */
export interface CommentMarkInput {
  /** `S1`, `S2`, ...; the server keeps it when it is free on the version. */
  label?: string;
  anchor: DocumentAnchor;
  comment: string;
  /** Off stores a human note and asks the agent nothing. */
  send_to_agent?: boolean;
}

/** A workspace file, or the artifact version it is. */
export interface CommentTarget {
  artifact_id: string;
  name: string;
  workspace_id: string;
  version: number;
  sha256: string;
  path: string;
  producer: Record<string, unknown>;
}

/** An artifact's threads, its newest version, and the next label on the viewed version. */
export interface CommentThreadList {
  artifact_id: string;
  head: CommentTarget;
  next_label: string;
  threads: ArtifactReview[];
}

/** What one send made. */
export interface SentCommentSession {
  session_key: string;
  message_id: string;
  threads: ArtifactReview[];
}

export type CommentSurfaceKind = 'agent-answer' | 'a2ui-surface' | 'browser-page';

/** The payload of a `comment_session` message part. */
export interface CommentAttachment {
  kind: CommentSurfaceKind;
  title?: string;
  marks: Array<{ label: string; anchor: DocumentAnchor; comment: string }>;
  /** Browser-drawn images (A2UI only): the overview has no label, a crop names its mark. */
  images?: Array<{ label?: string; data: string }>;
}
