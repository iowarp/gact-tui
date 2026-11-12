import { useCallback, useState, type ReactNode } from 'react';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * Keep the title and close control fixed while the complete result remains
 * reachable. The frame follows the dialog spec: a 16px icon and one-line UI
 * title, with the description and body indented to the title.
 */
export function ResultDialogContent({
  icon,
  title,
  description,
  descriptionTitle,
  descriptionAction,
  children,
  footer,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  /** Truncate the description to one line and reveal this text on hover. */
  descriptionTitle?: string;
  /** A small control beside the description, such as copying the full path. */
  descriptionAction?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [contentHeight, setContentHeight] = useState<number>();
  const observeContent = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const measure = () => setContentHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <DialogContent
      {...(!description ? { 'aria-describedby': undefined } : {})}
      className="flex max-h-[85dvh] min-w-0 flex-col gap-0 overflow-hidden rounded-[12px] pt-3.5 pr-3.5 pb-3.5 pl-[18px] sm:max-w-4xl"
      onOpenAutoFocus={(event) => {
        // Open on the result itself, so arrow keys read it and a header
        // control's tooltip never takes the first Escape.
        const region = (event.target as HTMLElement | null)?.querySelector<HTMLElement>(
          '[role="region"][aria-label="Scrollable result content"]',
        );
        if (!region) return;
        event.preventDefault();
        region.focus();
      }}
    >
      <DialogHeader className="shrink-0 gap-0">
        <div className="flex min-h-7 min-w-0 items-center gap-2.5 pr-8">
          <span aria-hidden="true" className="flex shrink-0 text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
          <DialogTitle className="truncate font-sans text-sm leading-5 font-semibold" title={title}>
            {title}
          </DialogTitle>
        </div>
        {description ? (
          <div className="mt-1 ml-[26px] flex min-w-0 items-center gap-1">
            <DialogDescription
              className={cn(
                'text-menu leading-normal',
                descriptionTitle ? 'truncate' : 'max-w-[92%]',
              )}
              title={descriptionTitle}
            >
              {description}
            </DialogDescription>
            {descriptionAction}
          </div>
        ) : null}
      </DialogHeader>
      <ScrollArea
        className="mt-3.5 ml-[26px] max-h-[65dvh] min-h-0 min-w-0"
        style={{ height: contentHeight ?? '65dvh' }}
        type="auto"
        viewportProps={{
          role: 'region',
          'aria-label': 'Scrollable result content',
          tabIndex: 0,
          className: 'overscroll-contain [&>div]:!block',
        }}
      >
        <div
          ref={observeContent}
          className="grid min-w-0 max-w-full grid-cols-1 gap-3 pr-3 pb-3 text-sm leading-6 [overflow-wrap:anywhere]"
        >
          {children}
        </div>
      </ScrollArea>
      {footer ? <div className="mt-[18px] shrink-0">{footer}</div> : null}
    </DialogContent>
  );
}
