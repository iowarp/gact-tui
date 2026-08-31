'use client';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ChevronDownIcon, PaperclipIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export type QueueItemProps = ComponentProps<'li'>;

export const QueueItem = ({ className, ...props }: QueueItemProps) => (
  <li
    className={cn(
      'group flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted',
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
  <div className={cn('flex shrink-0 items-center gap-0.5', className)} {...props} />
);

export type QueueItemActionProps = Omit<ComponentProps<typeof Button>, 'variant' | 'size'>;

export const QueueItemAction = ({ className, ...props }: QueueItemActionProps) => (
  <Button
    className={cn(
      'size-7 rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-muted-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
      className,
    )}
    size="icon"
    type="button"
    variant="ghost"
    {...props}
  />
);

export type QueueItemAttachmentProps = ComponentProps<'span'>;

export const QueueItemAttachment = ({ className, ...props }: QueueItemAttachmentProps) => (
  <span
    className={cn(
      'flex max-w-28 shrink-0 items-center gap-1 truncate rounded border bg-muted px-1.5 py-0.5 text-xs',
      className,
    )}
    {...props}
  />
);

export const QueueItemFile = ({ children, ...props }: QueueItemAttachmentProps) => (
  <QueueItemAttachment {...props}>
    <PaperclipIcon aria-hidden="true" className="size-3 shrink-0" />
    <span className="truncate">{children}</span>
  </QueueItemAttachment>
);

export type QueueListProps = ComponentProps<typeof ScrollArea>;

export const QueueList = ({ children, className, ...props }: QueueListProps) => (
  <ScrollArea className={cn('max-h-36', className)} {...props}>
    <ul className="space-y-0.5 pr-2">{children}</ul>
  </ScrollArea>
);

export type QueueSectionProps = ComponentProps<typeof Collapsible>;

export const QueueSection = ({ className, defaultOpen = true, ...props }: QueueSectionProps) => (
  <Collapsible className={cn(className)} defaultOpen={defaultOpen} {...props} />
);

export type QueueSectionTriggerProps = ComponentProps<'button'>;

export const QueueSectionTrigger = ({ children, className, ...props }: QueueSectionTriggerProps) => (
  <CollapsibleTrigger asChild>
    <button
      className={cn(
        'group flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted',
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
    <span>{count === undefined ? label : `${count} ${label}`}</span>
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
      'flex flex-col rounded-xl border border-border/80 bg-background/96 p-1.5 shadow-sm',
      className,
    )}
    {...props}
  />
);
