import { memo, useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { ShortcutKeys } from './key-chip';

export interface SaveBarProps {
  /** Typed values waiting to be saved. The bar shows only while this is above 0 or saving. */
  count: number;
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
  /** Save waits while a typed value is invalid. */
  invalid?: boolean;
  /** A save failure, on the bar. */
  error?: ReactNode;
  /** Words in place of "N changes" ("1 rule removed"). */
  label?: ReactNode;
  className?: string;
}

/**
 * Save bar (H): typed values wait here. One bar per page, "• N changes",
 * Ctrl S (⌘S), Discard and Save. Choices that apply at once never reach it.
 */
export const SaveBar = memo(function SaveBar({
  count,
  onSave,
  onDiscard,
  saving = false,
  invalid = false,
  error,
  label,
  className,
}: SaveBarProps) {
  const active = count > 0 || saving;
  useShortcut(
    'save-changes',
    () => {
      if (!saving && !invalid && count > 0) onSave();
    },
    { enabled: active, allowInTextField: true },
  );
  const barRef = useRef<HTMLDivElement>(null);
  const focus = useRef<{ inBar: boolean; outside: HTMLElement | null }>({
    inBar: false,
    outside: null,
  });
  useEffect(() => {
    function handleFocusIn(event: FocusEvent) {
      if (!(event.target instanceof HTMLElement)) return;
      const inBar = Boolean(barRef.current?.contains(event.target));
      focus.current.inBar = inBar;
      if (!inBar && !focusLost(event.target)) focus.current.outside = event.target;
    }
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);
  // Save and Discard disable themselves as they are pressed, and a finished
  // save takes the bar away: focus must not fall back to the window.
  useEffect(() => {
    if (saving || !focus.current.inBar) return;
    const frame = requestAnimationFrame(() => {
      if (!focusLost(document.activeElement)) return;
      const inBar = barRef.current?.querySelector<HTMLButtonElement>('button:enabled');
      const outside = focus.current.outside;
      const target =
        inBar ?? (outside?.isConnected && !outside.matches(':disabled') ? outside : null);
      focus.current.inBar = Boolean(inBar);
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, saving]);
  if (!active && !error) return null;
  return (
    <div
      aria-label="Unsaved changes"
      className={cn(
        'mt-3.5 flex h-[2.875rem] min-w-0 items-center gap-2.5 border-t border-border text-[0.78125rem] whitespace-nowrap',
        className,
      )}
      data-slot="save-bar"
      ref={barRef}
      role="region"
    >
      {active ? (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
      ) : null}
      <span className="min-w-0 truncate" role="status">
        {saving
          ? 'Saving…'
          : active
            ? (label ?? `${count} ${count === 1 ? 'change' : 'changes'}`)
            : null}
      </span>
      {error ? (
        <span className="min-w-0 truncate text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
      <span className="flex-1" />
      <ShortcutKeys className="mr-1" id="save-changes" variant="caps" />
      <Button disabled={saving || !count} onClick={onDiscard} size="sm" variant="ghost">
        Discard
      </Button>
      <Button disabled={saving || invalid || !count} onClick={onSave} size="sm">
        Save
      </Button>
    </div>
  );
});

/** Focus that has fallen back to the page or the window around the section. */
function focusLost(element: Element | null): boolean {
  return (
    !element ||
    element === document.body ||
    element.getAttribute('role') === 'dialog' ||
    element.getAttribute('data-slot') === 'dialog-content'
  );
}
