import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ClioInteractiveRowProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  running?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  actions?: ReactNode;
  appearance?: 'default' | 'navigation';
}

export function ClioInteractiveRow({
  selected,
  running,
  destructive,
  disabled,
  actions,
  appearance = 'default',
  className,
  children,
  onKeyDown,
  role,
  tabIndex,
  ...props
}: ClioInteractiveRowProps) {
  return (
    <div
      data-selected={selected || undefined}
      data-running={running || undefined}
      data-destructive={destructive || undefined}
      aria-disabled={disabled || undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          !event.defaultPrevented &&
          event.target === event.currentTarget &&
          !disabled &&
          role === 'button' &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      role={role}
      tabIndex={tabIndex ?? (role === 'button' && !disabled ? 0 : undefined)}
      className={cn(
        'group/row relative flex min-h-11 min-w-0 w-full max-w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 outline-none transition-[background-color,border-color,color,box-shadow] duration-150',
        'hover:border-border hover:bg-accent/60 focus-visible:border-primary/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-within:border-primary/40 focus-within:bg-accent/60',
        'data-[selected]:border-primary/50 data-[selected]:bg-primary/10 data-[running]:border-info/35 data-[running]:bg-info/5',
        'data-[destructive]:hover:border-destructive/40 data-[destructive]:hover:bg-destructive/10',
        'aria-disabled:pointer-events-none aria-disabled:opacity-50',
        appearance === 'navigation' &&
          'min-h-8 rounded-md border-0 px-2 py-0 hover:bg-sidebar-accent focus-within:bg-sidebar-accent data-[selected]:bg-sidebar-accent data-[running]:bg-info/5',
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1 self-stretch">{children}</div>
      {actions ? (
        <div
          className={cn(
            'relative z-10 ml-auto flex shrink-0 items-center gap-1 text-muted-foreground transition-[color,opacity] group-hover/row:text-foreground group-hover/row:opacity-100 group-focus-within/row:text-foreground group-focus-within/row:opacity-100 has-[[aria-expanded=true]]:opacity-100 group-data-[collapsible=icon]:hidden',
            appearance === 'navigation' ? 'opacity-0' : 'opacity-65',
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
