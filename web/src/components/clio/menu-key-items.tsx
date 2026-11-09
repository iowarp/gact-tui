import { cloneElement, type ComponentProps, type ReactElement } from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
  /** Marks the row by its icon; the label keeps the menu's text tone. */
  destructive?: boolean;
}) {
  return (
    <DropdownMenuItem
      aria-keyshortcuts={menuKey}
      className={cn('whitespace-nowrap', className)}
      menuKey={menuKey === 'Enter' ? '↵' : menuKey?.toUpperCase()}
      {...props}
    >
      {destructive
        ? cloneElement(icon, { className: cn(icon.props.className, 'text-destructive!') })
        : icon}
      <span className="min-w-0 truncate">{label}</span>
    </DropdownMenuItem>
  );
}
