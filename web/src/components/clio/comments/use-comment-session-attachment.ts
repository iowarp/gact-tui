import type { CommentAttachment } from '@clio/core/v3';
import { useEffect } from 'react';
import { ADD_COMMENT_SESSION_EVENT } from './comment-model';

/**
 * Attach comment sessions sent from any surface (an A2UI view, a browser page) to the next
 * message. A second session on the same surface replaces the first one's marks of that
 * surface, since the panel sends every mark of a session together.
 */
export function useCommentSessionAttachment(
  annotations: readonly CommentAttachment[],
  onAnnotationsChange?: (annotations: readonly CommentAttachment[]) => void,
): void {
  useEffect(() => {
    const attach = (event: Event) => {
      const detail = (event as CustomEvent<CommentAttachment>).detail;
      if (!detail || !Array.isArray(detail.marks) || !detail.marks.length || !onAnnotationsChange)
        return;
      onAnnotationsChange([
        ...annotations.filter(
          (session) => !(session.kind === detail.kind && session.title === detail.title),
        ),
        detail,
      ]);
    };
    window.addEventListener(ADD_COMMENT_SESSION_EVENT, attach);
    return () => window.removeEventListener(ADD_COMMENT_SESSION_EVENT, attach);
  }, [annotations, onAnnotationsChange]);
}
