import type { Message } from '@clio/core/v3';
import { useEffect, useRef, type RefObject } from 'react';
import { a2uiSurfaceDomId } from './a2ui-presentation';
import { useQuestionAnswer } from './question-answer-context';

/** Reveal the original surface, including a recovered or virtualized message. */
export function useSurfaceQuestionNavigation({
  messages,
  sessionId,
  scrollRef,
  jumpToMessage,
}: {
  messages: readonly Message[];
  sessionId?: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  jumpToMessage: (index: number) => void;
}): void {
  const target = useQuestionAnswer()?.surfaceTarget;
  const handled = useRef<typeof target>(undefined);
  const owner = sessionId ?? messages[0]?.session_id;
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !target || target.sessionId !== owner || handled.current === target) return;
    const index = messages.findIndex((message) =>
      message.blocks.some(
        (block) => block.type === 'a2ui' && block.surface_id === target.surfaceId,
      ),
    );
    if (index >= 0) jumpToMessage(index);
    let frame = 0;
    const reveal = () => {
      const surface = root.querySelector<HTMLElement>(
        `#${CSS.escape(a2uiSurfaceDomId(target.surfaceId))}`,
      );
      if (!surface) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        handled.current = target;
        observer.disconnect();
        surface.scrollIntoView({ block: 'center' });
        surface.focus({ preventScroll: true });
      });
    };
    // Waiting on actual DOM changes also covers catalogs and nested lazy tabs.
    // No polling deadline or guessed network delay decides where the view is.
    const observer = new MutationObserver(reveal);
    observer.observe(root, { childList: true, subtree: true });
    reveal();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [jumpToMessage, messages, owner, scrollRef, target]);
}
