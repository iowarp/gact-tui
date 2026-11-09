import { type ComponentProps, type ReactElement } from 'react';
import { DropdownMenuItem, DropdownMenuShortcut } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * A one-line menu row with its letter key on the right. The key is
 * announced through `aria-keyshortcuts`, not the row's name.
 */
export function KeyMenuItem({
  icon,
  label,
  menuKey,
  destructive = false,
  className,
  ...props
}: Omit<ComponentProps<typeof DropdownMenuItem>, 'children' | 'variant'> & {
  icon: ReactElement<{ className?: string }>;
  label: string;
  /** One letter, or `Enter`. */
  menuKey?: string;
  /** A destructive row: label and icon in the destructive tone (`.mi.ds`). */
  destructive?: boolean;
}) {
  return (
    <DropdownMenuItem
      aria-keyshortcuts={menuKey}
      className={cn('whitespace-nowrap', className)}
      data-menu-key={menuKey?.toLowerCase()}
      variant={destructive ? 'destructive' : 'default'}
      {...props}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
      {menuKey ? (
        <DropdownMenuShortcut aria-hidden="true" className="font-mono">
          {menuKey === 'Enter' ? '↵' : menuKey.toUpperCase()}
        </DropdownMenuShortcut>
      ) : null}
    </DropdownMenuItem>
  );
}
