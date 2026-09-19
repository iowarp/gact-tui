import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * Collapsed-by-default disclosure for technical/raw content: protocol wire
 * detail, provider metadata, raw JSON schemas, typed reason tokens. Callers
 * never pass `open`, so the primary line a screen renders never carries
 * technical vocabulary — only this disclosure's own (collapsed) content
 * does. Built on the reui `Collapsible` primitive (Radix) rather than a bare
 * `<details>`, so every disclosure in the app shares one keyboard/animation
 * contract; a caller keeps `.closest('[data-slot="collapsible"]')` and
 * `data-state` for state assertions instead of `<details>`'s native `open`.
 * The only addition over the bare primitive is a consistent, rotating
 * chevron and a uniform trigger style.
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
    <Collapsible className={cn('group', className)}>
      <CollapsibleTrigger
        className={cn(
          'flex w-fit cursor-pointer items-center gap-1 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          summaryClassName,
        )}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90"
        />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className={contentClassName}>{children}</CollapsibleContent>
    </Collapsible>
  );
}
