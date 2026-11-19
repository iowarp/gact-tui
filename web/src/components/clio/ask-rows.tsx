import { useRef, type ComponentProps, type ReactNode } from 'react';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AskKeyChip, AskSection } from './ask-card';
import { useScrollClipped } from './use-scroll-clipped';
import { askKeyAttributes } from './ask-card-keys';

export interface AskRowProps extends Omit<ComponentProps<'button'>, 'children'> {
  number?: number;
  label: ReactNode;
  detail?: ReactNode;
  /** A checkbox or a mark before the label (multi-choice). */
  control?: ReactNode;
  /** The row ↵ would pick. */
  highlighted?: boolean;
}

/**
 * Vertical option rows, for options that carry a line of detail. Under a capped card the rows
 * scroll, so the title, the write-in, Submit and the footer stay inside the card. Two rows stay
 * in view.
 */
export function AskRows({ className, ...props }: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollClipped(ref);
  return (
    <AskSection
      className={cn(
        // Rows keep their height (their min-h would otherwise let them shrink): the region scrolls.
        'clio-scrollbar mt-2 ml-[19px] flex min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-gutter:auto]! *:shrink-0 @max-[420px]/ask:ml-0 has-[[data-slot=ask-row]~[data-slot=ask-row]]:min-h-[62px] data-clipped:[mask-image:linear-gradient(#000_calc(100%-24px),transparent)]',
        className,
      )}
      data-slot="ask-rows"
      ref={ref}
      {...props}
    />
  );
}

/** Keys, marks and checks sit on a wrapped row's first line, as on a single-line row. */
const ROW_FIRST_LINE = 'flex h-[30px] shrink-0 items-center';

export function AskRow({
  number,
  label,
  detail,
  control,
  highlighted,
  className,
  ...props
}: AskRowProps) {
  const keys = [
    ...(number && number < 10 ? [String(number)] : []),
    ...(highlighted ? ['Enter'] : []),
  ];
  // A choosable row (radio, checkbox) keeps a 14px check column, as the spec's menus do.
  const checkable = props['aria-checked'] !== undefined;
  const checked = props['aria-checked'] === true || props['aria-checked'] === 'true';
  return (
    <button
      {...askKeyAttributes(keys)}
      className={cn(
        'flex min-h-[30px] w-full min-w-0 items-start gap-2.5 rounded-[7px] px-1.5 text-left text-menu text-foreground/85 outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:[box-shadow:inset_0_0_0_1.5px_var(--ring)] disabled:pointer-events-none disabled:opacity-50 aria-checked:text-foreground',
        // --hover sits at --card's level in the dark themes; a foreground tint reads in every theme.
        highlighted && 'bg-foreground/[0.07] text-foreground',
        className,
      )}
      data-highlighted={highlighted || undefined}
      data-slot="ask-row"
      type="button"
      {...props}
    >
      {control ? <span className={ROW_FIRST_LINE}>{control}</span> : null}
      {number && number < 10 ? (
        <span className={ROW_FIRST_LINE}>
          <AskKeyChip askKey={String(number)} />
        </span>
      ) : null}
      {/* The choice and its detail read whole: the detail takes the next line when it can't fit.
          A single line centres in the row; a wrapped one starts on the keys' line. */}
      <span
        className="flex min-h-[30px] min-w-0 flex-1 flex-wrap content-center items-baseline gap-x-2.5 py-[max(0px,calc(15px-0.5lh))]"
        data-slot="ask-row-text"
      >
        <span className="min-w-0">{label}</span>
        {detail ? <span className="min-w-0 text-label text-foreground/70">{detail}</span> : null}
      </span>
      {highlighted ? (
        <span className={ROW_FIRST_LINE}>
          <AskKeyChip askKey="Enter" />
        </span>
      ) : null}
      {checkable ? (
        <span
          aria-hidden="true"
          className={cn(ROW_FIRST_LINE, 'w-3.5 justify-center')}
          data-slot="ask-row-check"
        >
          {checked ? <CheckIcon className="size-[13px] text-accent-foreground" /> : null}
        </span>
      ) : null}
    </button>
  );
}
