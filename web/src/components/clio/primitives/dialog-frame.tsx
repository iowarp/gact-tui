import { memo, useCallback, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { InfoTip } from '../info-tip';
import { ShortcutKeys } from './key-chip';

/** Focus goes to the element marked with this attribute when a frame opens. */
const INITIAL_FOCUS = '[data-initial-focus]';

function focusSafeButton(event: Event) {
  const content = event.currentTarget as HTMLElement | null;
  const target = content?.querySelector<HTMLElement>(INITIAL_FOCUS);
  if (!target) return;
  event.preventDefault();
  target.focus();
}

/** The lone confirm takes focus when it replaces the buttons of an open frame. */
function focusOnMount(element: HTMLButtonElement | null) {
  element?.focus();
}

function FrameClose({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Close asChild>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close"
        className={cn('shrink-0 text-muted-foreground', className)}
      >
        <CloseIcon aria-hidden="true" />
      </Button>
    </DialogPrimitive.Close>
  );
}

export interface DialogFrameConfirm {
  label: string;
  onConfirm: () => void;
  /** `destructive` is only for deleting; it is the one red button. */
  tone?: 'default' | 'destructive';
  disabled?: boolean;
  /** Ctrl+Enter (⌘↩) confirms; on by default. */
  keyboard?: boolean;
}

export interface DialogFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon?: ReactNode;
  title: string;
  /** One line under the title; cut with an ellipsis, never two lines. */
  description?: string;
  children?: ReactNode;
  /** The confirm button. Omit for a frame with only Close. */
  confirm?: DialogFrameConfirm;
  /**
   * Label of the safe button that closes the frame (Cancel, Close, Got it).
   * `null` leaves the confirm as the one button, focused (Share's Done).
   */
  cancelLabel?: string | null;
  /** Extra buttons left of Cancel (a link-like secondary action). */
  secondary?: ReactNode;
  /** Controls in the title row before × (a mode switch such as URL | Command). */
  titleActions?: ReactNode;
  /** Explanation behind the ⓘ in the title row. */
  help?: ReactNode;
  className?: string;
}

/**
 * The one dialog: icon, title, ×, one-line description, body, buttons on the
 * right. 36% of the window wide (360 to 560 px), a bottom sheet below 600 px.
 * Esc or × closes, Ctrl+Enter confirms, focus starts on the safe button.
 */
export const DialogFrame = memo(function DialogFrame({
  open,
  onOpenChange,
  icon,
  title,
  description,
  children,
  confirm,
  cancelLabel: cancelProp,
  secondary,
  titleActions,
  help,
  className,
}: DialogFrameProps) {
  const cancelLabel = cancelProp === undefined ? (confirm ? 'Cancel' : 'Close') : cancelProp;
  const confirmOnly = cancelLabel === null && Boolean(confirm);
  const confirmKeys = Boolean(confirm && !confirm.disabled && confirm.keyboard !== false);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!confirm || confirm.disabled || confirm.keyboard === false) return;
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      confirm.onConfirm();
    },
    [confirm],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={focusSafeButton}
        onKeyDown={onKeyDown}
        data-frame="dialog"
        className={cn(
          'top-1/2 w-[clamp(360px,36vw,560px)] max-w-[calc(100%-2rem)] -translate-y-1/2 gap-0 p-0 sm:max-w-[calc(100%-2rem)]',
          'max-[599px]:top-auto max-[599px]:bottom-0 max-[599px]:left-0 max-[599px]:w-full max-[599px]:max-w-full max-[599px]:translate-x-0 max-[599px]:translate-y-0 max-[599px]:rounded-t-[14px] max-[599px]:rounded-b-none',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="mx-auto mt-2 hidden h-1 w-9 rounded-full bg-border max-[599px]:block"
        />
        <div className="flex h-12 min-w-0 items-center gap-2.5 pr-2.5 pl-4">
          {icon ? (
            <span
              aria-hidden="true"
              className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4"
            >
              {icon}
            </span>
          ) : null}
          <DialogTitle className="min-w-0 flex-1 truncate font-sans text-[14px] leading-7 font-semibold [overflow-wrap:normal]">
            {title}
          </DialogTitle>
          {help ? (
            <InfoTip className="size-7" label={`About ${title}`}>
              {help}
            </InfoTip>
          ) : null}
          {titleActions}
          <FrameClose />
        </div>
        {description ? (
          <DialogDescription
            title={description}
            className="-mt-2 truncate pr-3.5 pb-1 pl-[18px] text-[12.5px] [overflow-wrap:normal]"
          >
            {description}
          </DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{title}</DialogDescription>
        )}
        {children ? (
          <div data-slot="dialog-frame-body" className="min-w-0 px-[18px] pt-2 pb-2.5 text-[13px]">
            {children}
          </div>
        ) : null}
        <div
          data-slot="dialog-frame-footer"
          className="mt-1.5 flex min-w-0 items-center gap-2 border-t border-border py-2.5 pr-3 pl-[18px]"
        >
          <span
            aria-hidden="true"
            className="mr-auto flex min-w-0 items-center gap-1.5 overflow-hidden text-[11.5px] whitespace-nowrap text-faint"
          >
            <ShortcutKeys keys={['Esc']} variant="caps" />
            <span className="truncate">{cancelLabel ?? confirm?.label ?? 'Close'}</span>
            {confirmKeys && confirm ? (
              <>
                <ShortcutKeys className="ml-1.5" keys={['Ctrl+Enter']} variant="caps" />
                <span className="truncate">{confirm.label}</span>
              </>
            ) : null}
          </span>
          {secondary}
          {confirmOnly ? null : (
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" data-initial-focus="">
                {cancelLabel ?? 'Close'}
              </Button>
            </DialogPrimitive.Close>
          )}
          {confirm ? (
            <Button
              key={confirmOnly ? 'only' : 'confirm'}
              variant={confirm.tone === 'destructive' ? 'destructive' : 'default'}
              disabled={confirm.disabled}
              onClick={confirm.onConfirm}
              data-initial-focus={confirmOnly ? '' : undefined}
              ref={confirmOnly ? focusOnMount : undefined}
            >
              {confirm.label}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
});

/**
 * A window over the app (Settings): a title row with × and no back arrow, an
 * optional section list, and the content. Esc or × closes it; it fills the
 * screen below 600 px.
 */
export const WindowShell = memo(function WindowShell({
  open,
  onOpenChange,
  title,
  navigation,
  rail,
  children,
  toolbar,
  search,
  className,
  icon,
  contentRef,
  contentLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /**
   * The section list on the left. With a `rail` it shows from 1024 px and the
   * rail takes 768-1023 px; without one it shows from 768 px. Below 768 px use a
   * picker in the toolbar.
   */
  navigation?: ReactNode;
  /** The section list folded to icons for 768-1023 px. */
  rail?: ReactNode;
  /** Controls in the title row, before ×. */
  toolbar?: ReactNode;
  /** A wide search field right after the title. */
  search?: ReactNode;
  children: ReactNode;
  className?: string;
  /** A glyph before the title (Settings: the gear). */
  icon?: ReactNode;
  /** The scrolling content area, e.g. to return to the top on a section change. */
  contentRef?: Ref<HTMLDivElement>;
  /** Names the content region when it is a landmark. */
  contentLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-frame="window"
        // Esc with focus in a nested scope (a detail pane) closes that scope, not the window.
        onEscapeKeyDown={(event) => {
          if ((event.target as Element | null)?.closest?.('[data-escape-scope]')) {
            event.preventDefault();
          }
        }}
        // Land in the content rather than on the first title-row control; Tab moves on from there.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.target as HTMLElement)
            .querySelector<HTMLElement>('[data-window-content]')
            ?.focus({ preventScroll: true });
        }}
        className={cn(
          'top-1/2 flex h-[min(720px,calc(100dvh-2rem))] w-[min(980px,calc(100vw-2rem))] max-w-none -translate-y-1/2 flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-none',
          'max-[599px]:inset-0 max-[599px]:h-dvh max-[599px]:w-full max-[599px]:translate-x-0 max-[599px]:translate-y-0 max-[599px]:rounded-none',
          className,
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border pr-2 pl-3">
          {icon ? (
            <span aria-hidden="true" className="flex shrink-0 text-muted-foreground [&_svg]:size-4">
              {icon}
            </span>
          ) : null}
          <DialogTitle
            className={cn(
              'min-w-0 truncate font-sans text-sm font-semibold [overflow-wrap:normal]',
              !search && 'flex-1',
            )}
          >
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
          {search ? (
            <>
              <div className="ml-1.5 flex min-w-0 basis-[38%] max-[599px]:basis-auto">{search}</div>
              <span className="flex-1" />
            </>
          ) : null}
          {toolbar}
          <FrameClose />
        </div>
        <div className="flex min-h-0 flex-1">
          {navigation ? (
            <nav
              aria-label={`${title} sections`}
              className={cn(
                'hidden w-[max(14.25rem,16%)] shrink-0 overflow-y-auto border-r border-border bg-sidebar px-2 pt-2.5 pb-3.5',
                rail ? 'min-[1024px]:block' : 'min-[768px]:block',
              )}
            >
              {navigation}
            </nav>
          ) : null}
          {rail ? (
            <nav
              aria-label={`${title} scopes`}
              className="hidden w-11 shrink-0 flex-col items-center border-r border-border bg-sidebar pt-2.5 min-[768px]:max-[1023px]:flex"
            >
              {rail}
            </nav>
          ) : null}
          <div
            aria-label={contentLabel}
            className="clio-scrollbar @container min-w-0 flex-1 overflow-y-auto outline-none"
            data-window-content=""
            ref={contentRef}
            role={contentLabel ? 'region' : undefined}
            tabIndex={-1}
          >
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
