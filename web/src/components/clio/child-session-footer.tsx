import type { RunState } from '@clio/core/v3';
import { ArrowLeftIcon, BotIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ClioChildSessionFooterProps {
  parentTitle: string;
  pendingInteractions?: ReactNode;
  state: RunState;
  variant?: 'docked' | 'welcome';
  onHeightChange?: (height: number) => void;
  onReturnToParent: () => void;
}

function childSessionGuidance(state: RunState): string {
  if (state === 'running' || state === 'queued') {
    return 'This child is working. Send added constraints from the parent conversation.';
  }
  return 'This is a read-only record of delegated work. Continue from the parent conversation.';
}

/** Keeps delegated child transcripts inspectable without presenting them as independent chats. */
export function ClioChildSessionFooter({
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

  return (
    <div
      className={cn(
        'relative',
        variant === 'docked'
          ? 'pointer-events-none flex max-h-full min-h-0 flex-col px-4 pb-3 lg:px-6'
          : 'w-full',
      )}
      data-slot="clio-child-session-footer"
      ref={rootRef}
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-2">
        {pendingInteractions}
        <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border/40 bg-card/80 px-3 py-3 shadow-[0_12px_32px_-18px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:flex-row sm:items-center">
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
      </div>
    </div>
  );
}
