import {
  Fragment,
  memo,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useKeysPresentation, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { HeldKeyBadge, type HeldKeySide } from './key-chip';
import { focusIsQuiet, focusMayRaiseName } from './quiet-focus';
import { TOOLTIP_KEY } from './tooltip-key';

interface NamedTooltipProps {
  /** The control's name, shown on hover and focus. */
  label: string;
  /** Catalog id of the key that does the same thing. */
  shortcut?: string;
  /** One key of a range shortcut (`strip-position` at 3). */
  shortcutPosition?: number;
  /** Ad hoc keys in Windows form, for a key that is not in the catalog. */
  keys?: readonly string[];
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
  keys,
  side = 'bottom',
  children,
}: NamedTooltipProps) {
  const catalogued = useShortcutPresentation(shortcut, shortcutPosition);
  const adHoc = useKeysPresentation(shortcut ? undefined : keys);
  const presentation = catalogued ?? adHoc;
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (next && focusIsQuiet()) return;
        setOpen(next);
      }}
    >
      <TooltipTrigger
        asChild
        onFocus={(event) => {
          // Radix skips its focus-open when the event is default-prevented.
          if (!focusMayRaiseName()) event.preventDefault();
        }}
      >
        {children}
      </TooltipTrigger>
      {/* A name is never interactive, so it must not block a click on what it covers. */}
      <TooltipContent
        side={side}
        sideOffset={4}
        data-name-tooltip=""
      >
        <span>{label}</span>
        {presentation ? (
          <span className="inline-flex shrink-0 items-center gap-1 justify-self-end">
            {presentation.alternatives.map((text, index) => (
              <Fragment key={text}>
                {index > 0 ? <span className="text-[0.65625rem] opacity-70">or</span> : null}
                <kbd className={TOOLTIP_KEY}>{text}</kbd>
              </Fragment>
            ))}
          </span>
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
  /** Where the held-key badge sits (below by default). */
  shortcutSide?: HeldKeySide;
  /** 28px (default), 26px for the composer's toolbar row, or 22px for dense rows. */
  size?: 'default' | 'toolbar' | 'sm';
  /** A small count on the corner (comments, unread). */
  count?: number;
  /** `warning` is the bell's Needs-you badge (spec `.nfbell b`): a 15px warning pill. */
  countTone?: 'muted' | 'warning';
  tooltipSide?: NamedTooltipProps['side'];
  /** Skip the tooltip when the name is already visible next to the icon. */
  tooltip?: boolean;
  /**
   * A shorter one-line hover name when the accessible name is a sentence
   * (the bell's). Replaces the `label, count` hover name.
   */
  hoverLabel?: string;
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
  shortcutSide,
  size = 'default',
  count,
  countTone = 'muted',
  tooltipSide,
  tooltip = true,
  hoverLabel,
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
          : size === 'toolbar'
            ? 'size-[26px] rounded-[6px] [&_svg:not([class*=size-])]:size-[15px]'
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
          className={cn(
            'absolute tabular-nums',
            countTone === 'warning'
              ? '-top-[1.5px] -right-[2.5px] h-[0.9375rem] min-w-[0.9375rem] rounded-full bg-warning px-1 text-center text-[0.59375rem] leading-[0.9375rem] font-bold text-background'
              : '-top-0.5 -right-0.5 min-w-3.5 rounded-md bg-muted-foreground px-[3px] text-[0.53125rem] leading-[0.6875rem] font-semibold text-background',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
      {shortcut ? (
        <HeldKeyBadge id={shortcut} position={shortcutPosition} side={shortcutSide} />
      ) : null}
    </Button>
  );
  if (!tooltip) return button;
  const named = hoverLabel ?? (count ? `${label}, ${count}` : label);
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
