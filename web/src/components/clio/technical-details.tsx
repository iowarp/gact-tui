import { ChevronRightIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { HeldKeyBadge, ShortcutKeys } from './primitives/key-chip';

const TRIGGER_CLASS =
  'flex w-fit shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring';

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
  hintClassName,
  triggerProps,
  onOpenChange,
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
  hintClassName?: string;
  /** Extra attributes for the trigger, e.g. the key a surface maps to it. */
  triggerProps?: Record<string, string>;
  onOpenChange?: (open: boolean) => void;
}) {
  const trigger = (
    <CollapsibleTrigger
      {...triggerProps}
      className={cn(TRIGGER_CLASS, 'font-medium', summaryClassName)}
    >
      <ChevronRightIcon
        aria-hidden="true"
        className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90"
      />
      {title}
      {shortcut ? (
        <span aria-hidden="true" className="ml-1 inline-flex">
          <ShortcutKeys keys={[shortcut]} variant="inline" />
          <HeldKeyBadge keys={[shortcut]} side="cover" />
        </span>
      ) : null}
    </CollapsibleTrigger>
  );
  return (
    <Collapsible className={cn('group', className)} onOpenChange={onOpenChange}>
      {beside || hint ? (
        <div className={cn('flex min-w-0 items-center', beside ? 'gap-1' : 'gap-2')}>
          {beside}
          {trigger}
          {hint ? (
            <span className={cn('min-w-0 truncate text-muted-foreground', hintClassName)}>
              {hint}
            </span>
          ) : null}
        </div>
      ) : (
        trigger
      )}
      <CollapsibleContent className={contentClassName}>{children}</CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The same Technical details line for a surface that opens the content in a dialog frame
 * instead of inline (a decision card, whose facts must stay in view).
 */
export function TechnicalDetailsButton({
  title,
  keyChip,
  className,
  ...buttonProps
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type' | 'title'> & {
  title: string;
  /** The key chip after the title, for a surface that opens it with a key (D). */
  keyChip?: ReactNode;
}) {
  return (
    <button
      {...buttonProps}
      aria-haspopup="dialog"
      className={cn(TRIGGER_CLASS, className)}
      type="button"
    >
      <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0" />
      {title}
      {keyChip}
    </button>
  );
}
