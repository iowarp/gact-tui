import {
  forwardRef,
  Fragment,
  memo,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';

/**
 * The bar above whatever a frame shows: Where (crumbs) · What (facts) ·
 * Format (modes) · Talk and Take (actions, last). 34px, one line. It is a
 * size container: the facts drop first and the crumbs fold to their last
 * part when the frame is narrow.
 */
export const FrameBar = memo(function FrameBar({
  where,
  what,
  format,
  actions,
  label,
  className,
}: {
  where: ReactNode;
  what?: ReactNode;
  format?: ReactNode;
  /** Talk and Take: icon buttons and split buttons, in that order. */
  actions?: ReactNode;
  /** Accessible name of the toolbar ("File actions"). */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      data-slot="frame-bar"
      className={cn(
        '@container flex h-[34px] min-w-0 shrink-0 items-center gap-2 border-b border-border px-2 whitespace-nowrap',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {where}
        {what ? (
          <div className="hidden min-w-0 items-center gap-2 text-[11px] text-faint @2xl:flex">
            {what}
          </div>
        ) : null}
      </div>
      {format ? (
        <>
          <FrameDivider />
          {format}
        </>
      ) : null}
      {actions ? (
        <>
          <FrameDivider />
          <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
        </>
      ) : null}
    </div>
  );
});

/** The 1×16 rule between frame bar groups. */
export function FrameDivider({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('h-4 w-px shrink-0 bg-border', className)} />;
}

export interface FrameCrumb {
  label: string;
  onSelect?: () => void;
}

/**
 * Where the shown thing lives. Earlier parts fold away when the bar is narrow
 * so the last part (the name) always shows; the full path is the hover name.
 */
export const FrameCrumbs = memo(function FrameCrumbs({
  parts,
  className,
}: {
  parts: readonly FrameCrumb[];
  className?: string;
}) {
  const full = parts.map((part) => part.label).join(' / ');
  return (
    <nav
      aria-label="Location"
      title={full}
      className={cn('flex min-w-0 items-center gap-1 text-[12.5px]', className)}
    >
      {parts.map((part, index) => {
        const last = index === parts.length - 1;
        return (
          <Fragment key={`${index}:${part.label}`}>
            {index > 0 ? (
              <ChevronRightIcon
                aria-hidden="true"
                className="hidden size-3 shrink-0 text-faint @lg:block"
              />
            ) : null}
            {part.onSelect && !last ? (
              <button
                type="button"
                onClick={part.onSelect}
                className="hidden max-w-40 shrink truncate rounded-[4px] px-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring @lg:inline"
              >
                {part.label}
              </button>
            ) : (
              <span
                aria-current={last ? 'location' : undefined}
                className={cn(
                  'min-w-0 truncate',
                  last
                    ? 'shrink font-medium text-foreground'
                    : 'hidden max-w-40 shrink text-muted-foreground @lg:inline',
                )}
              >
                {part.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
});

export interface FrameTabTriggerProps {
  className: string;
  title: string;
  children: ReactNode;
}

export interface FrameTabProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onSelect'> {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  /** Unsaved changes: say so in words for assistive technology. */
  dirty?: boolean;
  /** The conversation changed it: the name turns teal and says so in words. */
  changed?: boolean;
  /** Pinned: first in the row, icon only, no close. */
  pinned?: boolean;
  /** Short of room: an inactive tab shows only its icon (the name is on hover). */
  compact?: boolean;
  /** Hover name; defaults to the label (a path is better when there is one). */
  title?: string;
  onSelect?: () => void;
  onClose?: () => void;
  /**
   * Renders the tab control itself, for a host whose tabs come from a tabs
   * library (a Radix `TabsTrigger`). It receives the classes, hover name and
   * contents to put on it. Without it the tab is a plain `role="tab"` button.
   */
  renderTrigger?: (props: FrameTabTriggerProps) => ReactElement;
}

/**
 * One open thing in a frame's tab strip: 30px, icon, one-line name, and a
 * close mark whose space is always kept. Pinned tabs and, when the row is
 * short of room, inactive ones shrink to their icon.
 *
 * The close mark is a pointer affordance outside the accessibility tree. A
 * tablist may own nothing but tabs and a tab's children are presentational,
 * so a real button on either side of the tab is a critical axe violation
 * (aria-required-children, nested-interactive). Keyboard users close the tab
 * with Delete, which the host announces through `aria-keyshortcuts`.
 */
export const FrameTab = memo(
  forwardRef<HTMLDivElement, FrameTabProps>(function FrameTab(
    {
      label,
      icon,
      active = false,
      dirty = false,
      changed = false,
      pinned = false,
      compact = false,
      title,
      onSelect,
      onClose,
      renderTrigger,
      className,
      ...rest
    },
    ref,
  ) {
    const iconOnly = Boolean(icon) && (pinned || (compact && !active));
    const closable = Boolean(onClose) && !pinned;
    const contents = (
      <>
        {icon ? (
          <span
            aria-hidden="true"
            className="grid size-3.5 shrink-0 place-items-center [&_svg:not([class*='size-'])]:size-3.5"
          >
            {icon}
          </span>
        ) : null}
        <span className={cn('min-w-0 truncate', iconOnly && 'sr-only')}>{label}</span>
        {changed ? <span className="sr-only">, changed in this conversation</span> : null}
        {dirty ? <span className="sr-only">, unsaved changes</span> : null}
        {pinned ? <span className="sr-only">, pinned</span> : null}
      </>
    );
    const triggerClassName = cn(
      'flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[7px] outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
      iconOnly ? 'justify-center px-2' : closable ? 'pr-6 pl-2' : 'px-2',
    );
    const hoverName = title ?? label;
    return (
      <div
        ref={ref}
        data-slot="frame-tab"
        data-active={active || undefined}
        data-changed={changed || undefined}
        data-pinned={pinned || undefined}
        className={cn(
          'group/frame-tab relative flex h-[30px] min-w-0 shrink-0 items-center rounded-[7px] text-[12.5px] whitespace-nowrap text-muted-foreground hover:bg-hover hover:text-foreground data-active:bg-hover data-active:text-foreground data-changed:text-changed',
          iconOnly ? 'w-8' : 'max-w-56 min-w-[min(6rem,100%)]',
          className,
        )}
        {...rest}
      >
        {renderTrigger ? (
          renderTrigger({ className: triggerClassName, title: hoverName, children: contents })
        ) : (
          <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onSelect}
            title={hoverName}
            className={triggerClassName}
          >
            {contents}
          </button>
        )}
        {closable && !iconOnly ? (
          <span
            aria-hidden="true"
            data-slot="frame-tab-close"
            title={`Close ${label}`}
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
              onClose?.();
            }}
            className="absolute top-1/2 right-1 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded-[5px] opacity-0 group-focus-within/frame-tab:opacity-100 group-hover/frame-tab:opacity-100 group-data-active/frame-tab:opacity-100 hover:bg-menu-highlight pointer-coarse:opacity-70"
          >
            <CloseIcon aria-hidden="true" className="size-3" />
          </span>
        ) : null}
      </div>
    );
  }),
);
