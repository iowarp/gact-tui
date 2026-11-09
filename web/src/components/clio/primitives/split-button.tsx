import { memo, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { NamedTooltip } from './icon-button';

export interface SplitButtonProps {
  /** The primary action's name; with `icon` only, it is the hover name. */
  label: string;
  icon?: ReactNode;
  /** Show the label as text (a toolbar of icons hides it). */
  showLabel?: boolean;
  onClick: () => void;
  /** Name of the chevron's menu, e.g. "Copy options". */
  menuLabel: string;
  /** Menu rows; mounted only while the menu is open. */
  children: ReactNode;
  shortcut?: string;
  variant?: 'ghost' | 'outline' | 'default';
  disabled?: boolean;
  className?: string;
}

/**
 * One verb with variants: the face does the usual thing, the chevron lists
 * the variants of the same verb (Copy ▾, Open ▾). Alt ↓ opens the chevron.
 */
export const SplitButton = memo(function SplitButton({
  label,
  icon,
  showLabel = !icon,
  onClick,
  menuLabel,
  children,
  shortcut,
  variant = 'ghost',
  disabled,
  className,
}: SplitButtonProps) {
  const presentation = useShortcutPresentation(shortcut);
  const [open, setOpen] = useState(false);
  const face = (
    <Button
      aria-label={showLabel ? undefined : label}
      aria-keyshortcuts={presentation?.aria}
      variant={variant}
      size={showLabel ? 'default' : 'icon'}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-r-none border-r-0',
        variant !== 'default' && 'hover:bg-hover',
        !showLabel &&
          'w-6 text-muted-foreground hover:text-foreground [&_svg:not([class*=size-])]:size-[15px]',
      )}
    >
      {icon}
      {showLabel ? label : null}
    </Button>
  );
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="split-button"
      className={cn('group/split inline-flex shrink-0 items-center rounded-[6px]', className)}
      onKeyDown={(event) => {
        if (event.altKey && event.key === 'ArrowDown') {
          event.preventDefault();
          if (!disabled) setOpen(true);
        }
      }}
    >
      {showLabel ? (
        face
      ) : (
        <NamedTooltip label={label} shortcut={shortcut}>
          {face}
        </NamedTooltip>
      )}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={menuLabel}
            data-slot="split-chevron"
            variant={variant}
            size="icon"
            disabled={disabled}
            className={cn(
              'rounded-l-none [&_svg:not([class*=size-])]:size-[11px]',
              variant === 'default'
                ? 'w-5 border-l border-primary-foreground/25 text-primary-foreground/80 hover:text-primary-foreground'
                : 'w-[15px] text-faint hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground',
            )}
          >
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
