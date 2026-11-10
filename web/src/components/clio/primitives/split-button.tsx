import { memo, useState, type ComponentProps, type ReactNode } from 'react';
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
import { HeldKeyBadge } from './key-chip';
import { menuAcceleratorKeyDown } from './menu-row';

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
  /** The chevron shows its Alt ↓ while Ctrl (⌘) is held: one per bar, not on every chevron. */
  menuKey?: boolean;
  variant?: 'ghost' | 'outline' | 'default';
  disabled?: boolean;
  /** The menu stays usable while the face is disabled (pick a variant that is allowed). */
  menuDisabled?: boolean;
  /**
   * The chosen variant, shown inside the filled button as a chip with the
   * chevron: `Execute [Interactive ▾]`. The chip is the menu trigger.
   */
  menuValue?: ReactNode;
  /** Inside the face, before the label: a number key chip. */
  leading?: ReactNode;
  /** Inside the button, after the menu: the ↵ chip. */
  trailing?: ReactNode;
  /** Extra face attributes: card keys, an accessible name, a hover reason. */
  faceProps?: Omit<ComponentProps<'button'>, 'onClick' | 'disabled' | 'children'> &
    Partial<Record<`data-${string}`, string>>;
  className?: string;
}

/**
 * One verb with variants: the face does the usual thing, the chevron lists
 * the variants of the same verb (Copy ▾, Open ▾). Alt ↓ opens the chevron.
 * With `menuValue` the chosen variant reads inside the button instead.
 */
export const SplitButton = memo(function SplitButton({
  label,
  icon,
  showLabel = !icon,
  onClick,
  menuLabel,
  children,
  shortcut,
  menuKey = false,
  variant = 'ghost',
  disabled,
  menuDisabled = disabled,
  menuValue,
  leading,
  trailing,
  faceProps,
  className,
}: SplitButtonProps) {
  const presentation = useShortcutPresentation(shortcut);
  const [open, setOpen] = useState(false);
  const valued = menuValue !== undefined && menuValue !== null;
  // A valued split button is one filled surface; its parts only tint on hover.
  const segment =
    'border-0 bg-transparent text-inherit shadow-none hover:bg-current/10 disabled:bg-transparent disabled:text-inherit disabled:opacity-100';
  const face = (
    <Button
      aria-label={showLabel ? undefined : label}
      aria-keyshortcuts={presentation?.aria}
      variant={variant}
      size={showLabel ? 'default' : 'icon'}
      disabled={disabled}
      onClick={onClick}
      {...faceProps}
      className={cn(
        'rounded-r-none border-r-0',
        variant !== 'default' && 'hover:bg-hover',
        !showLabel &&
          'w-6 text-muted-foreground hover:text-foreground [&_svg:not([class*=size-])]:size-[15px]',
        valued && [segment, 'gap-[7px] pr-1.5'],
        faceProps?.className,
      )}
    >
      {leading}
      {icon}
      {showLabel ? label : null}
      {shortcut ? <HeldKeyBadge id={shortcut} /> : null}
    </Button>
  );
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="split-button"
      data-disabled={valued && disabled ? '' : undefined}
      className={cn(
        'group/split inline-flex shrink-0 items-center rounded-[6px]',
        valued && 'h-7 rounded-[7px] text-[12.5px] font-medium whitespace-nowrap',
        valued &&
          (variant === 'default'
            ? 'bg-primary text-primary-foreground data-disabled:bg-muted data-disabled:text-muted-foreground'
            : 'border border-input text-foreground'),
        className,
      )}
      onKeyDown={(event) => {
        if (event.altKey && event.key === 'ArrowDown') {
          event.preventDefault();
          if (!menuDisabled) setOpen(true);
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
          {valued ? (
            <Button
              aria-label={menuLabel}
              data-slot="split-chevron"
              variant={variant}
              disabled={menuDisabled}
              className={cn(
                segment,
                // On a filled face a foreground tint deepens the contrast in light and dark;
                // on a disabled face the menu stays usable, so the chip keeps only a faint tint.
                variant === 'default'
                  ? 'bg-foreground/15 group-data-disabled/split:bg-foreground/[0.06] hover:bg-foreground/25 aria-expanded:bg-foreground/25'
                  : 'bg-current/15 hover:bg-current/25 aria-expanded:bg-current/25',
                'h-[22px] gap-1 rounded-[5px] pr-1 pl-[7px] text-[11.5px] font-normal [&_svg:not([class*=size-])]:size-[11px]',
              )}
            >
              <span className="min-w-0 truncate">{menuValue}</span>
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          ) : (
            <Button
              aria-label={menuLabel}
              data-slot="split-chevron"
              variant={variant}
              size="icon"
              disabled={menuDisabled}
              className={cn(
                'rounded-l-none [&_svg:not([class*=size-])]:size-[11px]',
                variant === 'default'
                  ? 'w-5 border-l border-primary-foreground/25 text-primary-foreground/80 hover:text-primary-foreground'
                  : 'w-[15px] text-faint hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground',
              )}
            >
              <ChevronDownIcon aria-hidden="true" />
              {menuKey ? <HeldKeyBadge id="split-menu" /> : null}
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={valued ? 'start' : 'end'}
          className="min-w-48"
          onKeyDown={menuAcceleratorKeyDown}
        >
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
      {trailing ? (
        <span aria-hidden="true" className="inline-flex shrink-0 items-center pr-2 pl-1.5">
          {trailing}
        </span>
      ) : null}
    </div>
  );
});
