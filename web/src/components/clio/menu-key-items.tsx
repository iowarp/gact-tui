import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type MenuIcon = LucideIcon;

/**
 * A one-line menu row: a muted 14px icon, the label, then its letter key on
 * the right, as the spec's conversation menu draws it. The key is announced
 * through `aria-keyshortcuts`, not the row's name.
 */
export function KeyMenuItem({
  label,
  icon: Icon,
  menuKey,
  destructive = false,
  className,
  ...props
}: Omit<ComponentProps<typeof DropdownMenuItem>, 'children' | 'variant'> & {
  label: string;
  icon?: MenuIcon;
  /** One letter, or `Enter`. */
  menuKey?: string;
  /** Shown in the destructive text tone. */
  destructive?: boolean;
}) {
  return (
    <DropdownMenuItem
      aria-keyshortcuts={menuKey}
      className={cn('whitespace-nowrap', className)}
      menuKey={menuKey === 'Enter' ? '↵' : menuKey?.toUpperCase()}
      variant={destructive ? 'destructive' : 'default'}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" className="text-muted-foreground" /> : null}
      <span className="min-w-0 truncate">{label}</span>
    </DropdownMenuItem>
  );
}
