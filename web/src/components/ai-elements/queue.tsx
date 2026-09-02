'use client';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from 'lucide-react';
import { m, type HTMLMotionProps } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';

export type QueueItemProps = HTMLMotionProps<'li'>;

export const QueueItem = ({ className, ...props }: QueueItemProps) => (
  <m.li
    className={cn(
      'group relative flex min-h-7 min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-sm transition-[background-color,opacity] duration-150 hover:bg-foreground/[0.035] focus-within:bg-foreground/[0.045] dark:hover:bg-foreground/[0.06]',
      className,
    )}
    {...props}
  />
);

export type QueueItemContentProps = ComponentProps<'span'>;

export const QueueItemContent = ({ className, ...props }: QueueItemContentProps) => (
  <span className={cn('min-w-0 grow truncate text-muted-foreground', className)} {...props} />
);

export type QueueItemActionsProps = ComponentProps<'div'>;

export const QueueItemActions = ({ className, ...props }: QueueItemActionsProps) => (
  <div
    className={cn(
      'flex shrink-0 items-center gap-0.5 opacity-55 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 md:opacity-35',
      className,
    )}
    {...props}
  />
);

export type QueueItemActionProps = Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & {
  tooltip?: string;
};

export const QueueItemAction = ({ className, tooltip, ...props }: QueueItemActionProps) => {
  const button = (
    <Button
      className={cn(
        'size-7 rounded-md text-muted-foreground/80 transition-[color,background-color,opacity] hover:bg-muted-foreground/10 hover:text-foreground focus-visible:text-foreground',
        className,
      )}
      size="icon"
      type="button"
      variant="ghost"
      {...props}
    />
  );

  if (!tooltip) return button;

  return (
    <TooltipProvider delayDuration={240}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export type QueueListProps = ComponentProps<typeof ScrollArea>;

export const QueueList = ({ children, className, viewportProps, ...props }: QueueListProps) => (
  <ScrollArea
    className={cn('min-h-0', className)}
    scrollHideDelay={500}
    type="hover"
    viewportProps={{
      ...viewportProps,
      className: cn('overscroll-contain', viewportProps?.className),
    }}
    {...props}
  >
    <ul className="space-y-px py-0.5 pr-1">{children}</ul>
  </ScrollArea>
);

export type QueueSectionProps = ComponentProps<typeof Collapsible>;

export const QueueSection = ({ className, defaultOpen = true, ...props }: QueueSectionProps) => (
  <Collapsible className={cn(className)} defaultOpen={defaultOpen} {...props} />
);

export type QueueSectionTriggerProps = ComponentProps<'button'>;

export const QueueSectionTrigger = ({
  children,
  className,
  ...props
}: QueueSectionTriggerProps) => (
  <CollapsibleTrigger asChild>
    <button
      className={cn(
        'group flex h-6 w-full items-center justify-between rounded-md px-1.5 text-left text-xs font-medium text-muted-foreground/90 transition-colors hover:text-foreground focus-visible:bg-muted/35',
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  </CollapsibleTrigger>
);

export type QueueSectionLabelProps = ComponentProps<'span'> & {
  count?: number;
  label: string;
  icon?: ReactNode;
};

export const QueueSectionLabel = ({
  count,
  label,
  icon,
  className,
  ...props
}: QueueSectionLabelProps) => (
  <span className={cn('flex items-center gap-1.5', className)} {...props}>
    <ChevronDownIcon
      aria-hidden="true"
      className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90"
    />
    {icon}
    <span aria-live="polite">{count === undefined ? label : `${count} ${label}`}</span>
  </span>
);

export type QueueSectionContentProps = ComponentProps<typeof CollapsibleContent>;

export const QueueSectionContent = ({ className, ...props }: QueueSectionContentProps) => (
  <CollapsibleContent className={cn(className)} {...props} />
);

export type QueueProps = ComponentProps<'div'>;

export const Queue = ({ className, ...props }: QueueProps) => (
  <div
    className={cn(
      'flex flex-col overflow-hidden rounded-xl border border-border/30 bg-card/70 p-1 shadow-[0_-14px_38px_-28px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:bg-card/60 dark:shadow-[0_-14px_38px_-24px_rgba(0,0,0,0.8)]',
      className,
    )}
    {...props}
  />
);
