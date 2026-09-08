import type { ReactNode } from 'react';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

/** Keep the title and close control fixed while the complete result remains reachable. */
export function ResultDialogContent({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogContent className="flex max-h-[85dvh] min-w-0 flex-col overflow-hidden sm:max-w-4xl">
      <DialogHeader className="shrink-0 pr-8">
        <DialogTitle className="break-words">{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <ScrollArea
        className="h-[65dvh] min-h-0 min-w-0"
        type="auto"
        viewportProps={{
          role: 'region',
          'aria-label': 'Scrollable result content',
          tabIndex: 0,
          className: 'overscroll-contain [&>div]:!block',
        }}
      >
        <div className="grid min-w-0 gap-3 pr-3 pb-3 text-sm leading-6">{children}</div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {footer ? <div className="shrink-0">{footer}</div> : null}
    </DialogContent>
  );
}
