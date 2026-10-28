import type { RunState, Session } from '@clio/core/v3';
import { ArrowLeftIcon, BotIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChildConversationFollowup } from './child-conversation-followup';

export interface ClioChildSessionFooterProps {
  session: Pick<Session, 'id' | 'parent_session_id' | 'workspace_id'>;
  parentTitle: string;
  pendingInteractions?: ReactNode;
  state: RunState;
  variant?: 'docked' | 'welcome';
  onHeightChange?: (height: number) => void;
  onReturnToParent: () => void;
}

function childSessionGuidance(state: RunState): string {
  if (state === 'running' || state === 'queued') {
    return 'Send a follow-up to steer this agent while it works.';
  }
  return 'Send a follow-up to continue with this agent.';
}

/** Keeps child follow-ups and parent navigation available in the central conversation. */
export function ClioChildSessionFooter({
  session,
  parentTitle,
  pendingInteractions,
  state,
  variant = 'docked',
  onHeightChange,
  onReturnToParent,
}: ClioChildSessionFooterProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (variant !== 'docked' || !element || !onHeightChange) return;
    const reportHeight = () => onHeightChange(Math.ceil(element.getBoundingClientRect().height));
    reportHeight();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(reportHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange, variant]);

  if (!session.parent_session_id) return null;

  return (
    <div
      className={cn(
        'relative',
        variant === 'docked'
          ? 'clio-composer-docked pointer-events-none flex max-h-full min-h-0 flex-col px-4 pb-3 lg:px-6'
          : 'w-full',
      )}
      data-slot="clio-child-session-footer"
      ref={rootRef}
    >
      <div
        data-evidence-composer
        className="pointer-events-auto mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-2"
      >
        {pendingInteractions}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-border/40 bg-card/80 shadow-[0_12px_32px_-18px_var(--shadow-color)] backdrop-blur-xl">
          <div className="flex min-w-0 flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BotIcon aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">Delegated conversation</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {childSessionGuidance(state)}
                </p>
              </div>
            </div>
            <Button
              aria-label={`Return to parent conversation ${parentTitle}`}
              className="w-full shrink-0 sm:w-auto"
              onClick={onReturnToParent}
              size="sm"
              title={`Return to ${parentTitle}`}
              type="button"
              variant="outline"
            >
              <ArrowLeftIcon aria-hidden="true" />
              Return to parent
            </Button>
          </div>
          <ChildConversationFollowup
            sessionId={session.id}
            parentSessionId={session.parent_session_id}
            workspaceId={session.workspace_id}
          />
        </div>
      </div>
    </div>
  );
}
