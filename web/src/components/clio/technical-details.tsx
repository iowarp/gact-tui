import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ShortcutKeys } from './primitives/key-chip';

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
  beside,
  children,
  className,
  contentClassName,
  summaryClassName,
  title,
  shortcut,
  hint,
  triggerProps,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  summaryClassName?: string;
  title: string;
  /** Actions on the trigger's line, before it (a row's fix beside its details). */
  beside?: ReactNode;
  /** A key chip after the title, for a surface that opens it with a key (D). */
  shortcut?: string;
  /** A quiet line beside the trigger saying what is inside. */
  hint?: string;
  /** Extra attributes for the trigger, e.g. the key a surface maps to it. */
  triggerProps?: Record<string, string>;
}) {
  const trigger = (
    <CollapsibleTrigger
      {...triggerProps}
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
      {shortcut ? (
        <span aria-hidden="true" className="ml-1 inline-flex">
          <ShortcutKeys keys={[shortcut]} variant="inline" />
        </span>
      ) : null}
    </CollapsibleTrigger>
  );
  return (
    <Collapsible className={cn('group', className)}>
      {beside || hint ? (
        <div className={cn('flex min-w-0 items-center', beside ? 'gap-1' : 'gap-2')}>
          {beside}
          {trigger}
          {hint ? <span className="min-w-0 truncate text-muted-foreground">{hint}</span> : null}
        </div>
      ) : (
        trigger
      )}
      <CollapsibleContent className={contentClassName}>{children}</CollapsibleContent>
    </Collapsible>
  );
}
