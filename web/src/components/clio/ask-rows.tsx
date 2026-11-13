import type { ComponentProps, ReactNode } from 'react';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AskKeyChip, AskSection } from './ask-card';
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

/** Vertical option rows, for options that carry a line of detail. */
export function AskRows({ className, ...props }: ComponentProps<'div'>) {
  return (
    <AskSection
      className={cn('mt-2 ml-[19px] flex flex-col gap-0.5 @max-[420px]/ask:ml-0', className)}
      data-slot="ask-rows"
      {...props}
    />
  );
}

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
        'flex min-h-[30px] w-full min-w-0 items-center gap-2.5 rounded-[7px] px-1.5 text-left text-menu text-foreground/85 outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:[box-shadow:inset_0_0_0_1.5px_var(--ring)] disabled:pointer-events-none disabled:opacity-50 aria-checked:text-foreground',
        // --hover sits at --card's level in the dark themes; a foreground tint reads in every theme.
        highlighted && 'bg-foreground/[0.07] text-foreground',
        className,
      )}
      data-highlighted={highlighted || undefined}
      data-slot="ask-row"
      type="button"
      {...props}
    >
      {control}
      {number && number < 10 ? <AskKeyChip askKey={String(number)} /> : null}
      <span className="min-w-0 shrink truncate">{label}</span>
      {detail ? (
        <span className="min-w-0 flex-1 truncate text-label text-foreground/70">{detail}</span>
      ) : (
        <span className="flex-1" />
      )}
      {highlighted ? <AskKeyChip askKey="Enter" /> : null}
      {checkable ? (
        <span
          aria-hidden="true"
          className="grid w-3.5 shrink-0 place-items-center"
          data-slot="ask-row-check"
        >
          {checked ? <CheckIcon className="size-[13px] text-accent-foreground" /> : null}
        </span>
      ) : null}
    </button>
  );
}
