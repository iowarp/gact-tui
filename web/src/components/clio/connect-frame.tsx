import type { ComponentProps, ReactNode } from 'react';
import { CheckIcon, LockIcon, TriangleAlertIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { Input } from '@/components/ui/input';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';

/**
 * The connect dialog frame: header, body and footer. On a page (first run) it is
 * 460 px, drawn in place without a scrim; over the app (`dialog`) it fills the
 * modal (36% of the window, 340 to 640 px). Below 600 px it is a bottom sheet
 * with a grab handle, or the full window with `narrow="window"`.
 */
export function ConnectFrame({
  icon,
  title,
  onClose,
  closeLabel = 'Close',
  children,
  footer,
  className,
  dialog = false,
  narrow = 'sheet',
}: {
  icon: ReactNode;
  title: string;
  /** Shows the × when there is somewhere to go back to. */
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Rendered inside a modal dialog, which this frame's title names. */
  dialog?: boolean;
  /** As a dialog under 600 px: a bottom `sheet`, or the full `window` (no handle, footer at the bottom). */
  narrow?: 'sheet' | 'window';
}) {
  const fullWindow = dialog && narrow === 'window';
  const heading = (
    <h1
      className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground"
      id="connect-frame-title"
    >
      {title}
    </h1>
  );
  return (
    <section
      aria-labelledby="connect-frame-title"
      className={cn(
        'w-[460px] max-w-full rounded-[12px] border border-border bg-popover text-[12.5px] text-popover-foreground shadow-[0_20px_60px_color-mix(in_oklab,var(--shadow-color)_50%,transparent)]',
        fullWindow &&
          'max-[599px]:flex max-[599px]:min-h-0 max-[599px]:flex-1 max-[599px]:flex-col max-[599px]:rounded-none max-[599px]:border-0 max-[599px]:shadow-none',
        className,
      )}
      data-frame="connect"
    >
      {dialog && !fullWindow ? (
        <span
          aria-hidden="true"
          className="mx-auto mt-2 hidden h-1 w-9 rounded-full bg-border max-[599px]:block"
        />
      ) : null}
      <header className="flex h-12 min-w-0 shrink-0 items-center gap-2.5 pr-2.5 pl-4">
        <span
          aria-hidden="true"
          className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4"
        >
          {icon}
        </span>
        {dialog ? <DialogPrimitive.Title asChild>{heading}</DialogPrimitive.Title> : heading}
        {onClose ? (
          <IconButton icon={<CloseIcon />} label={closeLabel} onClick={onClose} type="button" />
        ) : null}
      </header>
      <div
        className={cn(
          'flex min-w-0 flex-col gap-[13px] px-4 pb-3.5',
          fullWindow && 'max-[599px]:flex-1',
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className="flex min-w-0 shrink-0 items-center gap-2 border-t border-border py-2.5 pr-3 pl-4">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/** A labelled field: an 11.5px muted label, "optional" in the faint tone. */
export function ConnectField({
  htmlFor,
  label,
  optional = false,
  children,
}: {
  htmlFor: string;
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <span className="flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-muted-foreground">
        <label htmlFor={htmlFor}>{label}</label>
        {optional ? (
          <span aria-hidden="true" className="text-faint">
            optional
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

/** The 30px input the connect frame uses; `mono` for addresses and tokens. */
export function ConnectInput({
  mono = false,
  className,
  ...props
}: ComponentProps<typeof Input> & { mono?: boolean }) {
  return (
    <Input
      className={cn(
        'h-[30px] rounded-[7px] px-2.5 text-[12.5px] md:text-[12.5px]',
        mono && 'font-mono text-[12px] md:text-[12px]',
        className,
      )}
      {...props}
    />
  );
}
export type ConnectLineTone = 'error' | 'lock' | 'working' | 'done' | 'pending';

const LINE_MARK: Record<ConnectLineTone, ReactNode> = {
  error: <TriangleAlertIcon className="size-3.5 text-destructive" />,
  lock: <LockIcon className="size-3.5 text-muted-foreground" />,
  done: <CheckIcon className="size-3.5 text-primary" />,
  working: (
    <span className="block size-3 rounded-full border-[1.5px] border-primary border-t-transparent motion-safe:animate-spin" />
  ),
  pending: <span className="block size-3 rounded-full border-[1.5px] border-faint" />,
};

/**
 * One status line (12px, at least 26px tall): a 14px mark, the words, and
 * optional actions at the right. The words wrap rather than cut, so a next
 * step is never lost.
 */
export function ConnectStatusLine({
  tone,
  children,
  actions,
  meta,
  role,
  className,
}: {
  tone: ConnectLineTone;
  children: ReactNode;
  actions?: ReactNode;
  /** A short mono value at the right edge (elapsed time). */
  meta?: ReactNode;
  role?: 'alert' | 'status';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[26px] min-w-0 items-center gap-2 text-[12px] text-foreground/85',
        tone === 'error' && 'text-destructive',
        tone === 'pending' && 'text-faint',
        className,
      )}
      data-tone={tone}
      role={role}
    >
      <span aria-hidden="true" className="grid size-3.5 shrink-0 place-items-center">
        {LINE_MARK[tone]}
      </span>
      <span className="min-w-0 flex-1 text-pretty">{children}</span>
      {meta !== undefined ? (
        <span className="shrink-0 font-mono text-[11px] text-faint tabular-nums">{meta}</span>
      ) : null}
      {actions ? <span className="flex shrink-0 items-center gap-1">{actions}</span> : null}
    </div>
  );
}
