import {
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { IconButton } from './icon-button';

export interface DetailPaneProps {
  /** Glyph before the title, as in a dialog's title row. */
  icon?: ReactNode;
  title: string;
  /** Icon buttons in the title row, before ×. */
  actions?: ReactNode;
  /** A segmented control or text tabs under the title row. */
  tabs?: ReactNode;
  /** × and Esc (with focus in the pane) call this. */
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Detail pane (E): the details of one list row, opened beside the list with
 * Enter rather than over it. Same title row as a dialog. It takes focus when it
 * opens and hands it back to the opener when it closes. Esc inside the pane
 * closes the pane only; the window around it stays open.
 */
export const DetailPane = memo(function DetailPane({
  icon,
  title,
  actions,
  tabs,
  onClose,
  children,
  className,
}: DetailPaneProps) {
  const titleId = useId();
  const pane = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const node = pane.current;
    const active = document.activeElement;
    // A StrictMode re-run finds focus already in the pane; keep the first opener.
    if (active instanceof HTMLElement && !node?.contains(active)) opener.current = active;
    node?.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      const focusWasInside = !now || now === document.body || node?.contains(now);
      const target = opener.current;
      if (!focusWasInside || !target) return;
      // Under 40rem the list stays hidden until this commit ends, and a hidden opener can't take focus.
      queueMicrotask(() => {
        if (!node?.isConnected && target.isConnected) target.focus({ preventScroll: true });
      });
    };
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Escape') return;
      // A menu portaled from inside the pane bubbles here through React; it closes itself.
      if (!event.currentTarget.contains(event.target as Node)) return;
      event.stopPropagation();
      onClose();
    },
    [onClose],
  );

  return (
    <aside
      aria-labelledby={titleId}
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-background outline-none', className)}
      data-escape-scope=""
      data-slot="detail-pane"
      onKeyDown={onKeyDown}
      ref={pane}
      tabIndex={-1}
    >
      <div className="flex h-12 shrink-0 items-center gap-2.5 pr-2.5 pl-4">
        {icon ? (
          <span aria-hidden="true" className="flex shrink-0 text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <h2
          className="min-w-0 flex-1 truncate text-[14px] font-semibold"
          id={titleId}
          title={title}
        >
          {title}
        </h2>
        {actions}
        <IconButton icon={<CloseIcon />} label="Close" onClick={onClose} />
      </div>
      {tabs ? <div className="flex min-w-0 shrink-0 px-4 pb-2">{tabs}</div> : null}
      {/* A container, so rows and lists inside size to the pane rather than the whole list-detail. */}
      <div className="clio-scrollbar @container min-h-0 flex-1 overflow-y-auto px-4 pb-3 text-ui">
        {children}
      </div>
    </aside>
  );
});

/**
 * A list with an optional detail pane beside it, 42% of the width. When the
 * container is under 40rem the pane replaces the list until it closes.
 */
export function ListDetailLayout({
  list,
  detail,
  className,
}: {
  list: ReactNode;
  /** The open `DetailPane`, or nothing. */
  detail?: ReactNode;
  className?: string;
}) {
  const open = Boolean(detail);
  return (
    <div className={cn('@container flex min-h-0 min-w-0', className)} data-slot="list-detail">
      <div className={cn('min-w-0 flex-1', open && '@max-[40rem]:hidden')}>{list}</div>
      {open ? (
        <div className="flex w-[42%] min-w-0 shrink-0 border-l border-border @max-[40rem]:w-full @max-[40rem]:border-l-0">
          {detail}
        </div>
      ) : null}
    </div>
  );
}
