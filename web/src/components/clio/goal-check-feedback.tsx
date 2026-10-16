import { Shimmer } from '@/components/ai-elements/shimmer';
import { useReducedMotionConfig } from 'motion/react';
import { useNow } from '@/hooks/use-now';
import { useSessionWork } from './use-session-work';
import type { ReactNode } from 'react';

/** The independent judge has its own visible activity, separate from model work. */
export function SessionResponseFeedback({
  sessionId,
  children,
}: {
  sessionId?: string;
  children: ReactNode;
}) {
  return sessionId ? (
    <GoalCheckFeedback sessionId={sessionId}>{children}</GoalCheckFeedback>
  ) : (
    children
  );
}

export function GoalCheckFeedback({
  sessionId,
  children,
}: {
  sessionId: string;
  children?: ReactNode;
}) {
  const { data } = useSessionWork(sessionId);
  const checking = data?.goal?.state === 'active' && data.goal.phase === 'judging';
  const now = useNow(checking);
  const reducedMotion = useReducedMotionConfig();
  if (!checking) return children ?? null;
  const started = Date.parse(String(data.goal?.details?.judge_started_at ?? ''));
  const seconds = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : null;
  return (
    <div
      role="status"
      className="flex min-h-7 items-center gap-2 py-3 text-sm text-muted-foreground"
      data-slot="goal-check-feedback"
    >
      {reducedMotion ? (
        <span>Checking goal completion</span>
      ) : (
        <Shimmer as="span" duration={1.5}>
          Checking goal completion
        </Shimmer>
      )}
      {seconds !== null ? (
        <span aria-hidden="true" className="font-mono text-xs tabular-nums">
          {seconds}s
        </span>
      ) : null}
    </div>
  );
}
