import type { PendingInteraction } from '@clio/core/v3';
import { useEffect, useState } from 'react';
import { pendingInteractionDomId } from './interaction-control';

/** The pending plan review the log anchors to its tool call, if one waits. */
export function pendingPlanReview(
  interactions: readonly PendingInteraction[],
  sessionId?: string,
): PendingInteraction | undefined {
  return interactions.find(
    (interaction) =>
      interaction.status === 'pending' &&
      interaction.source.tool_name === 'plan_exit' &&
      (interaction.actions ?? []).includes('answer') &&
      (!sessionId || interaction.owner_session_id === sessionId),
  );
}

/** The bottom edge the log's content is seen above: its clipping frames and the composer. */
function seenWithin(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (!rect.height) return false;
  let top = 0;
  let bottom = window.innerHeight;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === 'visible') continue;
    const frame = parent.getBoundingClientRect();
    top = Math.max(top, frame.top);
    bottom = Math.min(bottom, frame.bottom);
  }
  const composer = document.querySelector('[data-slot="clio-composer-stack"]');
  if (composer && !composer.contains(element))
    bottom = Math.min(bottom, composer.getBoundingClientRect().top);
  return rect.top >= top - 1 && rect.bottom <= bottom + 1;
}

/**
 * Whether the plan card's own decision row can be seen in the log now. Rechecked on scroll,
 * resize and a slow tick (the log streams and remounts), never per streamed token.
 */
export function useInlinePlanDecisionInView(interactionId: string | undefined): boolean {
  const [seen, setSeen] = useState<{ id: string; inView: boolean }>();
  useEffect(() => {
    if (!interactionId) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const controls = document
        .getElementById(pendingInteractionDomId(interactionId))
        ?.querySelector('[data-slot="plan-decision-controls"]');
      const inView = controls ? seenWithin(controls) : false;
      setSeen((previous) =>
        previous?.id === interactionId && previous.inView === inView
          ? previous
          : { id: interactionId, inView },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    schedule();
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const timer = window.setInterval(schedule, 400);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.clearInterval(timer);
    };
  }, [interactionId]);
  return Boolean(interactionId && seen?.id === interactionId && seen.inView);
}
