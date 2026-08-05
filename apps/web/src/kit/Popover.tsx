import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import './popover.css';

export type PopoverPlacement = 'down' | 'up';

export interface PopoverProps {
  open: boolean;
  label: string;
  children: ReactNode;
  /** `up` is the composer's variant (model picker, command list). */
  placement?: PopoverPlacement;
  /** Escape hatch for a caller-driven dimension (e.g. the model picker's own
   *  drag-to-resize width) — inline style wins over the CSS width so a user
   *  resize sticks without fighting the class-driven default. */
  style?: CSSProperties;
  onClose: () => void;
}

/**
 * Anchored floating panel — dropdowns, pickers, header popovers.
 *
 * The caller supplies a `position: relative` anchor; the panel pins to it. Two
 * placements, both from the prototype: `down` (top: 100% + 4px, 8px radius)
 * and `up` (bottom: 100% + 8px, 10px radius, scrollable, rises 160ms).
 *
 * Dismissal is the primitive's job: Escape, and pointer-down outside.
 */
export function Popover({ open, label, children, placement = 'down', style, onClose }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const panel = panelRef.current;
      // Pointer-down rather than click: a click that starts inside and ends
      // outside (a drag off a control) must not dismiss.
      if (panel && !panel.contains(event.target as Node)) onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onClose]);

  if (!open) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      ref={panelRef}
      className="kit-popover"
      data-placement={placement}
      role="dialog"
      aria-label={label}
      style={style}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
