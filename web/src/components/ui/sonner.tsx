import { useEffect } from 'react';
import { useTheme } from '@/providers/appearance-provider';
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner';
import { CheckIcon, CircleAlertIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import { CloseIcon, InfoIcon } from '@/lib/icon-vocabulary';
import { t } from '@lingui/core/macro';

/**
 * Toasts sit at the top, below the 40px page header: at the bottom they
 * covered the composer's Send/stop control and its neighbours, and on the
 * right they sat over the side panel's rows. `expand` lays several toasts out
 * one under another instead of the collapsed deck, whose overlapping layers
 * left two notices drawn over each other. Up to three show at once; under
 * 600px Sonner widens them to the window, inside the mobile offset.
 */
const TOAST_OFFSET = { top: 48 } as const;
const TOAST_MOBILE_OFFSET = { top: 48, left: 16, right: 16 } as const;
const VISIBLE_TOASTS = 3;
const TOAST_GAP = 10;
/** The spec's lifetime: gone after five seconds, kept while hovered. */
const TOAST_DURATION = 5000;

const ICON = 'size-[15px] shrink-0';

/*
 * One row per toast, as the spec's `.xt`: icon, the line, one ghost action,
 * then close. Sonner runs unstyled so only these classes draw it; its own CSS
 * keeps positioning, stacking and swipe. The close button renders first in
 * Sonner's DOM, so `order-last` moves it to the end of the row.
 */
const TOAST_CLASSES = {
  toast:
    'cn-toast flex w-[var(--width)] min-h-[42px] items-center gap-2.5 rounded-[10px] border border-border bg-popover py-2 pr-1.5 pl-3 text-menu text-popover-foreground shadow-[0_10px_28px_color-mix(in_oklab,var(--shadow-color)_40%,transparent)] dark:shadow-[0_10px_28px_color-mix(in_oklab,var(--shadow-color)_75%,transparent)]',
  // Sonner centres its loader absolutely; `relative` keeps it in the icon slot.
  // The text starts 11px down with an 18px first line (42px for one line, as
  // the spec), so the icon sits on the title's first line however many follow.
  icon: 'relative mt-[4.5px] flex size-[15px] shrink-0 items-center justify-center self-start text-primary',
  content: 'flex min-w-0 flex-1 flex-col gap-0.5 py-[3px]',
  title: 'line-clamp-2 leading-4.5 text-foreground',
  description: 'line-clamp-2 text-label leading-4 !text-muted-foreground',
  actionButton:
    'inline-flex h-[26px] shrink-0 items-center rounded-[7px] border border-border px-2 font-medium text-menu leading-none whitespace-nowrap text-foreground/85 outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
  cancelButton:
    'inline-flex h-[26px] shrink-0 items-center rounded-[7px] px-2 font-medium text-menu leading-none whitespace-nowrap text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
  closeButton:
    'order-last grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
  error: '[&_[data-icon]]:text-destructive',
  info: '[&_[data-icon]]:text-info',
  warning: '[&_[data-icon]]:text-warning',
  loading: '[&_[data-icon]]:text-muted-foreground',
} satisfies NonNullable<ToasterProps['toastOptions']>['classNames'];

// A clamped title or description reads whole through the app-wide truncation hint.
const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme.dark ? 'dark' : 'light'}
      className="toaster group"
      // The library's default names the region in English ("Notifications alt+T").
      containerAriaLabel={t`Notifications`}
      position="top-center"
      offset={TOAST_OFFSET}
      mobileOffset={TOAST_MOBILE_OFFSET}
      visibleToasts={VISIBLE_TOASTS}
      gap={TOAST_GAP}
      duration={TOAST_DURATION}
      expand
      closeButton
      icons={{
        success: <CheckIcon className={ICON} />,
        info: <InfoIcon className={ICON} />,
        warning: <TriangleAlertIcon className={ICON} />,
        error: <CircleAlertIcon className={ICON} />,
        loading: <Loader2Icon className={`${ICON} motion-safe:animate-spin`} />,
        close: <CloseIcon className={ICON} />,
      }}
      style={
        {
          // Sonner's dark theme paints its close button from these; keep it a ghost icon.
          '--normal-bg': 'transparent',
          '--normal-bg-hover': 'var(--hover)',
          '--normal-border': 'transparent',
          '--normal-border-hover': 'transparent',
          '--normal-text': 'var(--muted-foreground)',
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        unstyled: true,
        classNames: { ...TOAST_CLASSES, ...toastOptions?.classNames },
      }}
      {...props}
    />
  );
};

/**
 * A dialog takes over from the notices shown before it opened: a toast left
 * over from the action that led here would otherwise sit on the dialog's
 * title or actions. Toasts raised while the dialog is open still show.
 */
/* Render it inside the dialog's content, which mounts only while it is open. */
function DismissToastsOnOpen() {
  useEffect(() => {
    toast.dismiss();
  }, []);
  return null;
}

export { DismissToastsOnOpen, Toaster };
