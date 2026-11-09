import { Fragment, memo, type ReactNode } from 'react';
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
          <div className="hidden min-w-0 items-center gap-2 text-[11px] text-muted-foreground @2xl:flex">
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

/**
 * One open thing in a frame's tab strip: 30px, icon, one-line name, close
 * button that appears on hover or when active (its space is always kept).
 */
export const FrameTab = memo(function FrameTab({
  label,
  icon,
  active = false,
  dirty = false,
  onSelect,
  onClose,
  className,
}: {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  /** Unsaved changes: say so in words for assistive technology. */
  dirty?: boolean;
  onSelect: () => void;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div
      data-slot="frame-tab"
      data-active={active || undefined}
      className={cn(
        'group/frame-tab flex h-[30px] max-w-56 min-w-0 shrink-0 items-center rounded-[7px] text-[12.5px] text-muted-foreground hover:bg-hover hover:text-foreground data-active:bg-hover data-active:text-foreground',
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onSelect}
        title={label}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[7px] pr-1 pl-2 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {icon ? (
          <span
            aria-hidden="true"
            className="grid size-3.5 shrink-0 place-items-center [&_svg:not([class*='size-'])]:size-3.5"
          >
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
        {dirty ? <span className="sr-only">, unsaved changes</span> : null}
      </button>
      {onClose ? (
        <button
          type="button"
          aria-label={`Close ${label}`}
          onClick={onClose}
          className="invisible mr-1 grid size-5 shrink-0 place-items-center rounded-[5px] outline-none group-hover/frame-tab:visible group-focus-within/frame-tab:visible group-data-active/frame-tab:visible hover:bg-menu-highlight focus-visible:ring-1 focus-visible:ring-ring"
        >
          <CloseIcon aria-hidden="true" className="size-3" />
        </button>
      ) : (
        <span className="w-1.5 shrink-0" />
      )}
    </div>
  );
});
