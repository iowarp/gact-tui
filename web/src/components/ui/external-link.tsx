import * as React from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { openExternalUrl } from '@/tauri/external-url';

export interface ExternalLinkProps extends Omit<React.ComponentPropsWithoutRef<'a'>, 'target' | 'rel'> {
  href: string;
  /**
   * Reports a failed open. Defaults to a toast; pass this to surface the
   * error inline (e.g. next to the control that triggered it) instead.
   *
   * Named `onOpenError`, not `onError`: anchors already carry a native
   * `onError` handler in React's DOM typings, and that isn't what fires here.
   */
  onOpenError?: (error: unknown) => void;
}

/**
 * The one path every external link in the app goes through.
 *
 * The desktop shell's opener plugin injects a click listener that intercepts
 * `target="_blank"` (and ctrl/shift-click) anchors and re-dispatches them
 * through its own scoped `open_url` command — a plain anchor whose click
 * this component didn't handle would otherwise silently fail whenever that
 * scope doesn't cover the URL. Handling the click ourselves and calling
 * `preventDefault` first stops that interception from ever seeing an
 * unhandled event, and `openExternalUrl` opens the link correctly on both
 * platforms: through the OS's default browser inside Tauri, and in a new
 * tab outside it.
 */
export const ExternalLink = React.forwardRef<HTMLAnchorElement, ExternalLinkProps>(
  function ExternalLink({ children, className, href, onClick, onOpenError, ...props }, ref) {
    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      openExternalUrl(href).catch((error: unknown) => {
        if (onOpenError) onOpenError(error);
        else toast.error(error instanceof Error ? error.message : 'Could not open the link.');
      });
    };

    return (
      <a
        {...props}
        className={cn(className)}
        href={href}
        onClick={handleClick}
        ref={ref}
        rel="noreferrer"
        target="_blank"
      >
        {children}
      </a>
    );
  },
);
