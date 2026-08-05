import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Icon } from './Icon';
import './layer.css';

export type LayerSize = 'settings' | 'window';

export interface LayerProps {
  open: boolean;
  /** Accessible name; also the visible heading. */
  title: string;
  children: ReactNode;
  /** `settings` is the prototype's fixed min(1040px, 92vw) x 80vh panel. */
  size?: LayerSize;
  /** Explicit dimensions for the resizable `window` variant (obs, files). */
  width?: number;
  height?: number;
  /** Optional glyph rendered immediately before the visible heading. */
  headerIcon?: ReactNode;
  /** Inline heading context, such as an observability trace state. */
  headerMeta?: ReactNode;
  /** Extra controls rendered after the meta, before the window buttons —
   *  e.g. the files layer's "browse…" affordance. */
  headerActions?: ReactNode;
  /** Show the window chrome used by desktop-style layers. */
  windowControls?: boolean;
  onClose: () => void;
}

/**
 * LayerChrome — the full-screen overlay surface (gact-tui#331).
 *
 * Settings, observability and files are OVERLAYS in the prototype, not
 * side-pane content. Rendering them into the right-hand detail slot put them
 * in the wrong place entirely; this is the surface they actually use.
 *
 * Shared chrome, verbatim: --t-sf card, --t-bd6 hairline, 12px radius,
 * --t-shadow, rising 160ms. The two variants differ only in sizing — settings
 * is fixed, the window variant is caller-sized so it can be dragged.
 */
export function Layer({
  open,
  title,
  children,
  size = 'window',
  width,
  height,
  headerIcon,
  headerMeta,
  headerActions,
  windowControls = false,
  onClose,
}: LayerProps) {
  const [maximized, setMaximized] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useRef(`layer-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    return () => restoreRef.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) setMaximized(false);
  }, [open]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => !el.hasAttribute('hidden'));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  const style = maximized
    ? {
        width: 'calc(100vw - 32px)',
        height: 'calc(100vh - 32px)',
        maxHeight: 'none',
      }
    : size === 'window' && (width || height)
      ? { ...(width ? { width: `${width}px` } : {}), ...(height ? { height: `${height}px` } : {}) }
      : undefined;

  return (
    <div
      className="kit-layer"
      data-maximized={maximized ? 'true' : 'false'}
      data-size={size}
      onKeyDown={onKeyDown}
    >
      <div className="kit-layer__scrim" data-testid="layer-scrim" onClick={onClose} />
      <div
        ref={cardRef}
        className="kit-layer__card"
        data-size={size}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="kit-layer__head">
          {headerIcon ? <span className="kit-layer__headicon">{headerIcon}</span> : null}
          <h2 className="kit-layer__title" id={titleId}>
            {title}
          </h2>
          {headerMeta ? <span className="kit-layer__headmeta">{headerMeta}</span> : null}
          <span className="kit-layer__spacer" />
          {headerActions}
          {windowControls ? (
            <>
              {/* LayerChrome.dc.html titles this "Expand" (the detail-slot's
                  own equivalent button says "Maximize" — same glyph, see
                  kit/Icon.tsx). `maximized` toggling to a "Restore" label/title
                  is a real, working superset of the prototype's own chrome,
                  whose Expand button carries no click handler at all. */}
              <button
                type="button"
                className="kit-layer__windowbtn"
                aria-label={maximized ? `Restore ${title}` : `Maximize ${title}`}
                aria-pressed={maximized}
                title={maximized ? 'Restore' : 'Expand'}
                onClick={() => setMaximized((value) => !value)}
              >
                <Icon name="expand" size={12} />
              </button>
              {/* "Pop out" — same shared chrome. The prototype's own button has
                  no onClick either (decorative there too); this build is
                  explicit about WHY it does nothing on web (no Tauri window
                  API here) rather than silently mimicking an inert control. */}
              <button
                type="button"
                className="kit-layer__windowbtn"
                aria-label={`Pop out ${title}`}
                title="opens in a window on desktop only"
                disabled
              >
                <Icon name="popout" size={12} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="kit-layer__windowbtn kit-layer__close"
            aria-label={`Close ${title}`}
            title="Close"
            onClick={onClose}
          >
            {/* LayerChrome.dc.html's own Close is an SVG X; the bespoke
                Settings/diff header (never routed through LayerChrome in the
                prototype) uses plain text — matched here per chrome kind. */}
            {windowControls ? <Icon name="x" size={11} /> : '✕'}
          </button>
        </header>
        <div className="kit-layer__body">{children}</div>
      </div>
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
