import { type RefObject, useLayoutEffect } from 'react';

export const CONVERSATION_COLUMN_LEFT = '--conversation-column-left';
export const CONVERSATION_COLUMN_RIGHT = '--conversation-column-right';

/**
 * Publish the transcript column's edges on the session surface so the docked
 * pending cards and composer share the rows' column. The scrollbar and outline
 * gutter only exist inside the transcript scroller, so the edges come from its
 * observed boxes rather than duplicated constants.
 */
export function useConversationColumn(
  scrollRef: RefObject<HTMLElement | null>,
  maxColumnWidth: number,
) {
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const surface = scroller?.closest<HTMLElement>('[data-slot="session-transcript"]');
    if (!scroller || !surface || typeof ResizeObserver === 'undefined') return;
    // An observation is delivered after layout, so these reads never force one.
    const observer = new ResizeObserver(([entry]) => {
      const outer = entry?.borderBoxSize?.[0]?.inlineSize;
      if (!entry || !outer) return;
      const inner = entry.contentRect.width;
      const paddingLeft = entry.contentRect.left;
      const centred = Math.max(0, inner - maxColumnWidth) / 2;
      surface.style.setProperty(CONVERSATION_COLUMN_LEFT, `${paddingLeft + centred}px`);
      surface.style.setProperty(
        CONVERSATION_COLUMN_RIGHT,
        `${Math.max(0, outer - paddingLeft - inner) + centred}px`,
      );
    });
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      surface.style.removeProperty(CONVERSATION_COLUMN_LEFT);
      surface.style.removeProperty(CONVERSATION_COLUMN_RIGHT);
    };
  }, [maxColumnWidth, scrollRef]);
}
