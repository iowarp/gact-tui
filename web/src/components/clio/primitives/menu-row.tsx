import { memo, type KeyboardEvent, type ReactNode } from 'react';
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
  /**
   * The description is a reason the row is unavailable and must be read whole:
   * it stays after the label when it fits, else it wraps onto lines of its own
   * under the label instead of being cut (a ⋯ menu on a phone).
   */
  wrapDescription?: boolean;
  /** A small muted second line under the label (a host, what a choice does). */
  detail?: string;
  /**
   * A state as a mark and a word, left-aligned in the 62px status column with
   * the 34px action column after it (Online, Offline).
   */
  status?: { label: string; tone: StatusTone };
  /** A state word in the fixed 58px tag column (On, Off, Needs you). */
  tag?: { text: string; tone?: TagTone };
  /** A short mono value in the fixed 52px column (12 GB, 4 min). */
  value?: string;
  /** Shows the 14px check column; `true` draws the check. */
  checked?: boolean;
  /** Catalog id of the key that runs this row, shown as text. */
  shortcut?: string;
  /**
   * A one-key accelerator while the menu is open (a tab's right-click menu:
   * P, F, Y, C). Underlined in the label when the menu was opened from the
   * keyboard; the menu host handles the key (see `menuAcceleratorKeyDown`).
   */
  accelerator?: string;
  /** Opens a submenu or a window: shows a › in the last column. */
  submenu?: boolean;
  /** An ⓘ explanation button, kept outside the row's main action. */
  info?: ReactNode;
  /** An unreachable choice: dims the icon and mutes the name, keeping every word readable. */
  muted?: boolean;
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
  wrapDescription = false,
  detail,
  status,
  tag,
  value,
  checked,
  shortcut,
  accelerator,
  submenu = false,
  info,
  muted = false,
  className,
}: MenuRowProps) {
  return (
    <span data-slot="menu-row" className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
            muted && 'opacity-50',
          )}
        >
          {icon}
        </span>
      ) : null}
      {detail ? (
        <span className="flex min-w-0 flex-1 flex-col whitespace-nowrap leading-[1.3]">
          <span className={cn('truncate', muted && 'text-muted-foreground')}>
            <JumpLabel label={label} letter={accelerator} />
          </span>
          <span title={detail} className="truncate text-[11px] text-muted-foreground">
            {detail}
          </span>
        </span>
      ) : (
        <span
          className={cn(
            'flex min-w-0 flex-1 items-baseline gap-2 whitespace-nowrap',
            wrapDescription && 'flex-wrap gap-y-0 py-0.5',
          )}
        >
          <span className={cn('max-w-full shrink-0 truncate', muted && 'text-muted-foreground')}>
            <JumpLabel label={label} letter={accelerator} />
          </span>
          {description ? (
            <span
              title={wrapDescription ? undefined : description}
              className={cn(
                'min-w-0 text-[12px] text-muted-foreground',
                wrapDescription ? 'leading-[1.35] whitespace-normal' : 'truncate',
              )}
            >
              {description}
            </span>
          ) : null}
        </span>
      )}
      {status ? (
        <span className="mr-[34px] flex min-w-[62px] shrink-0">
          <StatusIndicator className="text-[11px]" label={status.label} tone={status.tone} />
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
      {shortcut ? <ShortcutKeys id={shortcut} variant="menu" className="pl-2" /> : null}
      {accelerator && jumpLetterIndex(label, accelerator) < 0 ? (
        <MenuAcceleratorKey letter={accelerator} />
      ) : null}
      {submenu ? (
        <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      ) : null}
      {info ? <span className="-mr-1 flex shrink-0">{info}</span> : null}
    </span>
  );
});

/**
 * Where a jump letter sits in its label: the first word that starts with it,
 * else its first occurrence; -1 when the label doesn't contain it.
 */
// oxlint-disable-next-line react/only-export-components
export function jumpLetterIndex(label: string, letter: string): number {
  const text = label.toLocaleUpperCase();
  const key = letter.toLocaleUpperCase();
  if (key.length !== 1) return -1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === key && (index === 0 || /\s/u.test(text[index - 1]))) return index;
  }
  return text.indexOf(key);
}

/**
 * A label with its jump letter underlined (workbench-keyboard, "Menus show the
 * key that works anywhere"). The underline is drawn only in a menu opened from
 * the keyboard; with the mouse the label reads plainly and the right column
 * keeps the key that works without the menu.
 */
export function JumpLabel({ label, letter }: { label: string; letter?: string }) {
  const index = letter ? jumpLetterIndex(label, letter) : -1;
  if (index < 0) return label;
  return (
    <>
      {label.slice(0, index)}
      <u
        data-slot="menu-jump-letter"
        className="no-underline decoration-muted-foreground underline-offset-[3px] [[data-opened-by=keyboard]_&]:underline"
      >
        {label[index]}
      </u>
      {label.slice(index + 1)}
    </>
  );
}

/**
 * A jump letter the label doesn't contain, in the last key column; shown only
 * in a menu opened from the keyboard. The menu host handles the key.
 */
export function MenuAcceleratorKey({ letter }: { letter: string }) {
  return (
    <kbd
      data-slot="menu-accelerator"
      // A jump letter is for the keyboard: a menu opened with the mouse shows only keys.
      className="w-4 shrink-0 pl-2 text-right font-sans text-[11.5px] text-muted-foreground [[data-opened-by=pointer]_&]:hidden"
    >
      {letter}
    </kbd>
  );
}

/**
 * Jump letters for rows whose names are only known at run time (folded modes
 * and tools): a word's first letter, then any letter of the name, then a
 * digit, skipping letters `taken` by the menu's fixed rows and each other.
 */
// oxlint-disable-next-line react/only-export-components
export function assignJumpLetters(labels: readonly string[], taken: Iterable<string>): string[] {
  const used = new Set([...taken].map((letter) => letter.toLocaleUpperCase()));
  return labels.map((label) => {
    const letters = label.toLocaleUpperCase().replace(/[^A-Z0-9 ]/gu, '');
    const initials = letters.split(' ').map((word) => word.charAt(0));
    const letter = [...initials, ...letters.replace(/ /gu, ''), ...'123456789'].find(
      (candidate) => candidate && !used.has(candidate),
    );
    if (!letter) return '';
    used.add(letter);
    return letter;
  });
}

/**
 * The keydown handler for a menu whose rows carry `accelerator` letters: the
 * key runs the row marked `data-accelerator` with that letter, as a click
 * does, which also closes the menu. Put it on the menu content.
 */
// oxlint-disable-next-line react/only-export-components
export function menuAcceleratorKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.key.length !== 1) return;
  // A submenu's keys reach this menu through React's tree; they belong to the submenu.
  if (!event.currentTarget.contains(event.target as Node)) return;
  const key = event.key.toLocaleUpperCase();
  const item = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-accelerator]')].find(
    (candidate) =>
      candidate.dataset.accelerator === key && candidate.getAttribute('aria-disabled') !== 'true',
  );
  if (!item) return;
  event.preventDefault();
  event.stopPropagation();
  item.click();
}
