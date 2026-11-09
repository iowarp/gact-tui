import { memo, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { HeldKeyBadge } from './key-chip';
import { focusIsQuiet } from './quiet-focus';

interface NamedTooltipProps {
  /** The control's name, shown on hover and focus. */
  label: string;
  /** Catalog id of the key that does the same thing. */
  shortcut?: string;
  /** One key of a range shortcut (`strip-position` at 3). */
  shortcutPosition?: number;
  side?: ComponentProps<typeof TooltipContent>['side'];
  children: ReactElement;
}

/**
 * The hover name every icon carries: its name and, when it has one, the key
 * that does the same thing. The content mounts only while open.
 */
export function NamedTooltip({
  label,
  shortcut,
  shortcutPosition,
  side = 'bottom',
  children,
}: NamedTooltipProps) {
  const presentation = useShortcutPresentation(shortcut, shortcutPosition);
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (next && focusIsQuiet()) return;
        setOpen(next);
      }}
    >
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={4}
        className="gap-2 px-2 py-1 text-[11.5px] font-medium"
      >
        <span>{label}</span>
        {presentation ? (
          <kbd className="rounded-[3px] bg-background/15 px-1 font-mono text-[10.5px] font-normal">
            {presentation.text}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

export interface IconButtonProps
  extends Omit<ComponentProps<typeof Button>, 'size' | 'children' | 'aria-label'> {
  /** Accessible name and hover name. Required: an icon never goes unexplained. */
  label: string;
  icon: ReactNode;
  /** Catalog id; adds the key to the tooltip, the held-key badge and `aria-keyshortcuts`. */
  shortcut?: string;
  /** One key of a range shortcut (the strip's icons by position). */
  shortcutPosition?: number;
  /** 28px (default) or 22px for dense rows. */
  size?: 'default' | 'sm';
  /** A small count on the corner (comments, unread). */
  count?: number;
  tooltipSide?: NamedTooltipProps['side'];
  /** Skip the tooltip when the name is already visible next to the icon. */
  tooltip?: boolean;
  /**
   * Unavailable here, and why: the button reads as disabled but keeps its
   * hover name, which adds the reason (a disabled button shows no tooltip).
   */
  disabledReason?: string;
}

/** An icon-only button with a required name, its key and an inside focus ring. */
export const IconButton = memo(function IconButton({
  label,
  icon,
  shortcut,
  shortcutPosition,
  size = 'default',
  count,
  tooltipSide,
  tooltip = true,
  disabledReason,
  variant = 'ghost',
  className,
  onClick,
  ...props
}: IconButtonProps) {
  const presentation = useShortcutPresentation(shortcut, shortcutPosition);
  const button = (
    <Button
      aria-label={label}
      aria-keyshortcuts={presentation?.aria}
      aria-disabled={disabledReason ? true : undefined}
      aria-description={disabledReason}
      data-slot="icon-button"
      variant={variant}
      size={size === 'sm' ? 'icon-xs' : 'icon'}
      className={cn(
        'relative text-muted-foreground hover:bg-hover hover:text-foreground aria-pressed:bg-hover aria-pressed:text-foreground',
        size === 'sm'
          ? 'rounded-[5px] [&_svg:not([class*=size-])]:size-3.5'
          : '[&_svg:not([class*=size-])]:size-[17px]',
        disabledReason &&
          'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground',
        className,
      )}
      onClick={disabledReason ? (event) => event.preventDefault() : onClick}
      {...props}
    >
      {icon}
      {count !== undefined && count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-3.5 rounded-md bg-muted-foreground px-[3px] text-[8.5px] leading-[11px] font-semibold text-background tabular-nums"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
      {shortcut ? <HeldKeyBadge id={shortcut} position={shortcutPosition} /> : null}
    </Button>
  );
  if (!tooltip) return button;
  const named = count ? `${label}, ${count}` : label;
  return (
    <NamedTooltip
      label={disabledReason ? `${named}: ${disabledReason}` : named}
      shortcut={shortcut}
      shortcutPosition={shortcutPosition}
      side={tooltipSide}
    >
      {button}
    </NamedTooltip>
  );
});
