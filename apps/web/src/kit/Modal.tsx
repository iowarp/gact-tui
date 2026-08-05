import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import './modal.css';

export type ModalTone = 'default' | 'danger';

export interface ModalProps {
  open: boolean;
  /** Accessible name. Rendered as the dialog heading unless `header` is given. */
  title: string;
  /** Replaces the default heading row entirely when supplied. */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** `danger` swaps the border to the error ramp (the prototype's destructive variant). */
  tone?: ModalTone;
  /**
   * Constrain height and scroll the body instead of growing the page — the
   * prototype's `max-height:72vh` column variant.
   */
  scrollBody?: boolean;
  onClose: () => void;
}

/**
 * THE dialog scaffold. Every dialog in the app is this component.
 *
 * Geometry is the prototype's, verbatim: a 680px panel on an --t-scrim
 * backdrop, 12px radius, --t-bd6 hairline, --t-shadow elevation, rising
 * 160ms. Consumers pass content, never geometry — that is the whole point of
 * the kit, and the conformance guard fails any surface that restates it.
 *
 * Accessibility is part of the primitive so no caller can forget it: focus is
 * trapped while open, Escape closes, focus returns to whatever opened it, and
 * the dialog is labelled by its own heading.
 */
export function Modal({
  open,
  title,
  header,
  footer,
  children,
  tone = 'default',
  scrollBody = false,
  onClose,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;

  // Remember the invoker so focus can go back where the user left it.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    return () => restoreFocusRef.current?.focus?.();
  }, [open]);

  // Move focus to the PANEL itself, not its first control. The first control
  // in DOM order is the close button, and opening a dialog with "Close" focused
  // is both surprising and destructive-by-one-keystroke. Focusing the labelled
  // container makes assistive tech announce the dialog before its controls.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // Trap: cycle within the dialog rather than escaping to the page behind.
      const focusable = focusableWithin(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div className="kit-modal" onKeyDown={onKeyDown}>
      {/* Backdrop. Clicking it dismisses, matching the prototype. */}
      <div className="kit-modal__scrim" onClick={onClose} data-testid="modal-scrim" />
      <div
        ref={panelRef}
        className="kit-modal__panel"
        data-tone={tone}
        data-scroll-body={scrollBody ? 'true' : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="kit-modal__header">
          {/* Always the flex:1 slot so the close button sits at the far right
              (the prototype's own layout) whether this is the default
              heading or a caller's custom `header` — a custom header used to
              hug the close button instead of pushing it to the edge. */}
          <div className="kit-modal__headerslot">
            {header ?? (
              <h2 className="kit-modal__title" id={titleId}>
                {title}
              </h2>
            )}
          </div>
          {header ? (
            <span className="kit-modal__sr-title" id={titleId}>
              {title}
            </span>
          ) : null}
          <button
            type="button"
            className="kit-modal__close"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>

        <div className="kit-modal__body">{children}</div>

        {footer ? <div className="kit-modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  // Deliberately NOT filtered on `offsetParent`: it is null for every element
  // in jsdom (which silently emptied this list and disabled the trap), and in
  // a real browser it is also null for `position: fixed` subtrees — which is
  // exactly what a dialog is. `[hidden]` is the honest visibility test here;
  // the selector already excludes disabled controls.
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('hidden') && el.closest('[hidden]') === null,
  );
}
