import { memo, type ReactNode } from 'react';
import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShortcutKeys } from './key-chip';
import { StatusIndicator, type StatusTone } from './status-indicator';
import { Tag, type TagTone } from './tag';

export interface MenuRowProps {
  icon?: ReactNode;
  label: string;
  /** Muted words after the label; cut with an ellipsis, full text on hover. */
  description?: string;
  /** A small muted second line under the label (a host, what a choice does). */
  detail?: string;
  /** A state as a mark and a word in the fixed 72px status column (Online, Offline). */
  status?: { label: string; tone: StatusTone };
  /** A state word in the fixed 58px tag column (On, Off, Needs you). */
  tag?: { text: string; tone?: TagTone };
  /** A short mono value in the fixed 52px column (12 GB, 4 min). */
  value?: string;
  /** Shows the 14px check column; `true` draws the check. */
  checked?: boolean;
  /** Catalog id of the key that runs this row, shown as text. */
  shortcut?: string;
  /** Opens a submenu or a window: shows a › in the last column. */
  submenu?: boolean;
  /** An ⓘ explanation button, kept outside the row's main action. */
  info?: ReactNode;
  className?: string;
}

/**
 * The one-line contents of a menu row. Place it inside DropdownMenuItem,
 * ContextMenuItem or CommandItem; those own the 32px height, highlight and
 * keyboard handling. Trailing columns have fixed widths so a list of rows
 * lines up and nothing moves on hover.
 */
export const MenuRow = memo(function MenuRow({
  icon,
  label,
  description,
  detail,
  status,
  tag,
  value,
  checked,
  shortcut,
  submenu = false,
  info,
  className,
}: MenuRowProps) {
  return (
    <span data-slot="menu-row" className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
      {icon ? (
        <span
          aria-hidden="true"
          className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg:not([class*='size-'])]:size-4"
        >
          {icon}
        </span>
      ) : null}
      {detail ? (
        <span className="flex min-w-0 flex-1 flex-col whitespace-nowrap leading-[1.3]">
          <span className="truncate">{label}</span>
          <span title={detail} className="truncate text-[11px] text-muted-foreground">
            {detail}
          </span>
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-baseline gap-2 whitespace-nowrap">
          <span className="max-w-full shrink-0 truncate">{label}</span>
          {description ? (
            <span
              title={description}
              className="min-w-0 truncate text-[12px] text-muted-foreground"
            >
              {description}
            </span>
          ) : null}
        </span>
      )}
      {status ? (
        <span className="flex w-[72px] shrink-0 justify-end">
          <StatusIndicator label={status.label} tone={status.tone} />
        </span>
      ) : null}
      {tag ? <Tag tone={tag.tone}>{tag.text}</Tag> : null}
      {value !== undefined ? (
        <span className="w-[52px] shrink-0 truncate text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {value}
        </span>
      ) : null}
      {checked !== undefined ? (
        <span aria-hidden="true" className="grid w-3.5 shrink-0 place-items-center">
          {checked ? <CheckIcon className="size-3.5" /> : null}
        </span>
      ) : null}
      {shortcut ? <ShortcutKeys id={shortcut} variant="text" className="shrink-0 pl-2" /> : null}
      {submenu ? (
        <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      ) : null}
      {info ? <span className="-mr-1 flex shrink-0">{info}</span> : null}
    </span>
  );
});
