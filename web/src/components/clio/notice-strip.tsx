import type { ComponentType, ReactNode } from 'react';
import { TruncatedText } from './primitives/truncate';

/**
 * The app-wide warning strip above every page: an icon, what is wrong, the
 * wrapping detail that says why or what to do, and the strip's own actions.
 */
export function NoticeStrip({
  actions,
  detail,
  icon: Icon,
  label,
  slot,
  title,
}: {
  actions?: ReactNode;
  /** Wraps rather than truncating: the cause or next step is the point of the strip. */
  detail?: ReactNode;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  label: string;
  slot: string;
  title: string;
}) {
  return (
    <section
      aria-label={label}
      className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-l-2 border-l-warning bg-warning/10 py-2 pr-1.5 pl-3 text-menu"
      data-slot={slot}
      role="alert"
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 basis-[min(100%,20rem)]">
        <TruncatedText className="font-medium text-foreground">{title}</TruncatedText>
        {detail ? <p className="text-pretty break-words text-muted-foreground">{detail}</p> : null}
      </div>
      {actions ? <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </section>
  );
}
