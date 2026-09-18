import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Collapsed-by-default disclosure for technical/raw content: protocol wire
 * detail, provider metadata, raw JSON schemas, typed reason tokens. Callers
 * never pass `open`, so the primary line a screen renders never carries
 * technical vocabulary — only this disclosure's own (collapsed) content
 * does. A real `<details>` element under the hood, so existing
 * `.closest('details')` / `toHaveAttribute('open')` test assertions keep
 * working; the only addition over a bare `<details>` is a consistent,
 * rotating chevron and a uniform summary style.
 */
export function TechnicalDetails({
  children,
  className,
  contentClassName,
  summaryClassName,
  title,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  summaryClassName?: string;
  title: string;
}) {
  return (
    <details className={cn('group', className)}>
      <summary
        className={cn(
          'flex w-fit cursor-pointer list-none items-center gap-1 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          summaryClassName,
        )}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3 shrink-0 transition-transform group-open:rotate-90"
        />
        {title}
      </summary>
      <div className={contentClassName}>{children}</div>
    </details>
  );
}
