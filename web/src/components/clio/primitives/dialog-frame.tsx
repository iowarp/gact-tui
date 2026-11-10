import { memo, useCallback, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { DIALOG_FULL_WINDOW_LAYOUT, DIALOG_SHEET_CLASS } from '@/lib/dialog-sheet';
import { cn } from '@/lib/utils';
import { InfoTip } from '../info-tip';
import { ShortcutKeys } from './key-chip';

/**
 * Focus goes to the first element marked with this attribute when a frame opens:
 * the safe button, or a body field that is the point of the dialog (Rename's
 * name, its text selected). A marked field that is disabled (a picker still
 * loading) is passed over, or focus would stay behind the dialog.
 */
const INITIAL_FOCUS = '[data-initial-focus]:not(:disabled):not([aria-disabled="true"])';

function focusSafeButton(event: Event) {
  const content = event.currentTarget as HTMLElement | null;
  const target = content?.querySelector<HTMLElement>(INITIAL_FOCUS);
  if (!target) return;
  event.preventDefault();
  target.focus();
  if (target instanceof HTMLInputElement) target.select();
}

/**
 * Pins a centred frame's top edge where it opened, so content that appears
 * later (an Advanced section) grows the frame downward instead of moving it.
 * `--dialog-frame-top` lets a scrolling body cap itself to the space below.
 */
function pinTopEdge(node: HTMLDivElement | null) {
  if (!node) return;
  const place = () => {
    for (const name of ['top', 'max-height', '--tw-translate-y', '--dialog-frame-top']) {
      node.style.removeProperty(name);
    }
    if (window.innerWidth < 600) return;
    const top = Math.max(16, Math.round((window.innerHeight - node.offsetHeight) / 2));
    node.style.top = `${top}px`;
    node.style.maxHeight = `calc(100dvh - ${top + 16}px)`;
    node.style.setProperty('--tw-translate-y', '0px');
    node.style.setProperty('--dialog-frame-top', `${top}px`);
  };
  place();
  window.addEventListener('resize', place);
  return () => window.removeEventListener('resize', place);
}

function preventDefault(event: Event) {
  event.preventDefault();
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

/** The key chip inside a footer button; the sheet below 600 px drops it. */
function FooterKey({ keys, className }: { keys: readonly string[]; className?: string }) {
  return (
    // Under the spec frame's ~460 px (44% below a 1036 px window) the chips drop,
    // before the window's 1024 px fold; the sheet never shows them.
    <span aria-hidden="true" className="inline-flex @max-[24rem]:hidden max-[599px]:hidden">
      <ShortcutKeys className={className} keys={keys} variant="inline" />
    </span>
  );
}

/** The grab handle a bottom sheet shows below 600 px (see `DIALOG_SHEET_CLASS`). */
export function DialogSheetHandle({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mx-auto mt-2 hidden h-1 w-9 shrink-0 rounded-full bg-border max-[599px]:block',
        className,
      )}
    />
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
  /**
   * `Enter`: a plain Enter confirms too (outside fields and other buttons), and
   * the button shows the key. For an acknowledgement such as Got it.
   */
  key?: 'Enter';
}

export interface DialogFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon?: ReactNode;
  title: string;
  /** A sentence under the title, aligned with its text; it wraps rather than cut. */
  description?: string;
  /** What a screen reader hears when there is no visible description (defaults to the title). */
  srDescription?: string;
  children?: ReactNode;
  /** The confirm button. Omit for a frame with only Close. */
  confirm?: DialogFrameConfirm;
  /**
   * Label of the safe button that closes the frame (Cancel, Close, Got it).
   * `null` leaves the confirm as the one button, focused (Share's Done).
   */
  cancelLabel?: string | null;
  /** The left side of the footer (a quiet link such as Release history). */
  footerStart?: ReactNode;
  /** Extra buttons left of Cancel (a link-like secondary action). */
  secondary?: ReactNode;
  /** Controls in the title row before × (a mode switch such as URL | Command). */
  titleActions?: ReactNode;
  /** Explanation behind the ⓘ in the title row. */
  help?: ReactNode;
  /** Opens centred, then keeps its top edge while the content grows. */
  growDown?: boolean;
  /** A confirmation that interrupts (removing something): an alertdialog that a click outside does not close. */
  alert?: boolean;
  /**
   * Under 600 px: a bottom `sheet` (the default) or the full `window` (spec
   * connect-infrastructure "Dialogs … Under 600 px, full window"; Connect and
   * Manage agents opt in).
   */
  narrow?: 'sheet' | 'window';
  className?: string;
}

/**
 * The one dialog width (spec connect-infrastructure "Dialogs"): 36% of the window,
 * 340 to 640 px (340 at 768, 461 at 1280); under 600 px the frame is a full-width
 * bottom sheet. Callers don't widen it. A dialog built on `DialogContent` uses this
 * class to match.
 */
export const DIALOG_FRAME_WIDTH = 'w-[clamp(340px,36vw,640px)]';

/**
 * The one dialog: icon, title, ×, a description under the title, body, buttons on the
 * right. {@link DIALOG_FRAME_WIDTH} wide, a full-width bottom sheet
 * below 600 px. The key chips in the buttons drop first, once the footer is
 * narrower than the spec frame. Esc or × closes, Ctrl+Enter confirms, focus
 * starts on the safe button unless a body field is marked `data-initial-focus`.
 */
export const DialogFrame = memo(function DialogFrame({
  open,
  onOpenChange,
  icon,
  title,
  description,
  srDescription,
  children,
  confirm,
  cancelLabel: cancelProp,
  secondary,
  footerStart,
  titleActions,
  help,
  growDown,
  alert,
  narrow = 'sheet',
  className,
}: DialogFrameProps) {
  const fullWindow = narrow === 'window';
  const cancelLabel = cancelProp === undefined ? (confirm ? 'Cancel' : 'Close') : cancelProp;
  const confirmOnly = cancelLabel === null && Boolean(confirm);
  const confirmKeys = Boolean(confirm && !confirm.disabled && confirm.keyboard !== false);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!confirm || confirm.disabled || confirm.keyboard === false) return;
      if (event.key !== 'Enter') return;
      // Ctrl+Shift+Enter is a dialog's Test key (SSH host, NDP endpoint), never its confirm.
      if (event.shiftKey) return;
      const plain =
        confirm.key === 'Enter' &&
        !(event.target as Element).closest('input, textarea, select, button, a, [contenteditable]');
      if (!plain && !(event.ctrlKey || event.metaKey)) return;
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
        onPointerDownOutside={alert ? preventDefault : undefined}
        ref={growDown ? pinTopEdge : undefined}
        // Radix sets role="dialog"; pass a role only to replace it.
        {...(alert ? { role: 'alertdialog' } : {})}
        data-frame="dialog"
        className={cn(
          'top-1/2 max-w-[calc(100%-2rem)] -translate-y-1/2 gap-0 p-0 sm:max-w-[calc(100%-2rem)]',
          DIALOG_FRAME_WIDTH,
          fullWindow ? DIALOG_FULL_WINDOW_LAYOUT : DIALOG_SHEET_CLASS,
          className,
        )}
      >
        {fullWindow ? null : <DialogSheetHandle />}
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
            className={cn(
              '-mt-2 pr-3.5 pb-1 text-[12.5px] leading-normal text-pretty',
              icon ? 'pl-[42px]' : 'pl-4',
            )}
          >
            {description}
          </DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{srDescription ?? title}</DialogDescription>
        )}
        {children ? (
          <div
            data-slot="dialog-frame-body"
            // The body starts under the title text (spec `.xd .bd`: 16px icon + 10px gap).
            // No rule closes it, so a last settings row drops its own too. Its setting rows
            // stay inline at every frame width (spec `.xdb .xr`): label 36%, control the rest.
            className={cn(
              'min-w-0 pt-2 pr-[18px] text-[13px] [&>[data-slot=settings-row-frame]:last-child>[data-slot=settings-row]]:border-b-0',
              // Full window: the body takes the height, so the buttons sit at the bottom.
              fullWindow && 'max-[599px]:flex-1',
              '[&_[data-slot=settings-row]]:grid-cols-[36%_minmax(0,1fr)] [&_[data-slot=settings-control]]:justify-start [&_[data-slot=settings-control]>input]:flex-1',
              icon ? 'pl-[42px]' : 'pl-[18px]',
            )}
          >
            {children}
          </div>
        ) : null}
        <div
          data-slot="dialog-frame-footer"
          className="@container flex min-w-0 items-center justify-end gap-2 pt-[18px] pr-3.5 pb-3.5 pl-[18px]"
        >
          {footerStart ? (
            <div className="mr-auto flex min-w-0 items-center overflow-hidden text-[12px] whitespace-nowrap text-muted-foreground">
              {footerStart}
            </div>
          ) : null}
          {secondary}
          {confirmOnly ? null : (
            <DialogPrimitive.Close asChild>
              <Button className="border-border gap-[7px]" variant="ghost" data-initial-focus="">
                {cancelLabel ?? 'Close'}
                <FooterKey
                  className="border-muted-foreground/45 text-muted-foreground"
                  keys={['Esc']}
                />
              </Button>
            </DialogPrimitive.Close>
          )}
          {confirm ? (
            <Button
              key={confirmOnly ? 'only' : 'confirm'}
              variant={confirm.tone === 'destructive' ? 'danger' : 'default'}
              // The face fills the whole 28 px, under the border too.
              className="gap-[7px] bg-clip-border"
              disabled={confirm.disabled}
              onClick={confirm.onConfirm}
              data-initial-focus={confirmOnly ? '' : undefined}
              ref={confirmOnly ? focusOnMount : undefined}
            >
              {confirm.label}
              {confirmKeys ? (
                <FooterKey
                  className="border-current/45"
                  keys={[confirm.key === 'Enter' ? 'Enter' : 'Ctrl+Enter']}
                />
              ) : null}
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
  picker,
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
   * The section list on the left. With a `rail` it shows from 880 px and the
   * rail takes 600-879 px; without one it shows from 600 px. Below 600 px the
   * `picker` stands in the title's place.
   */
  navigation?: ReactNode;
  /** The section list folded to scope icons for 600-879 px. */
  rail?: ReactNode;
  /** Below 600 px: the current section, opening every section, in place of the title. */
  picker?: ReactNode;
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
          'max-[599px]:inset-0 max-[599px]:h-dvh max-[599px]:max-h-none max-[599px]:w-full max-[599px]:translate-x-0 max-[599px]:translate-y-0 max-[599px]:rounded-none',
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
              picker && 'max-[599px]:sr-only',
            )}
          >
            {title}
          </DialogTitle>
          {picker ? <div className="flex min-w-0 shrink min-[600px]:hidden">{picker}</div> : null}
          <DialogDescription className="sr-only">{title}</DialogDescription>
          {search ? (
            <>
              {/* On a phone a search button stays compact; a live query field takes the free width. */}
              <div className="ml-1.5 flex min-w-0 basis-[38%] max-[599px]:basis-[24%] max-[599px]:has-[input]:grow">
                {search}
              </div>
              <span className="flex-1 max-[599px]:[:has(input)+&]:hidden" />
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
                rail ? 'min-[880px]:block' : 'min-[600px]:block',
              )}
            >
              {navigation}
            </nav>
          ) : null}
          {rail ? (
            <nav
              aria-label={`${title} scopes`}
              className="hidden w-11 shrink-0 flex-col items-center border-r border-border bg-sidebar pt-2.5 min-[600px]:max-[879px]:flex"
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
