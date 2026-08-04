import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from './Icon';
import './contextmenu.css';

export interface MenuItemDef {
  id: string;
  label: string;
  ariaLabel?: string;
  description?: string;
  icon?: ReactNode;
  checked?: boolean;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  title?: string;
}

export interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: MenuItemDef[];
  label?: string;
  eyebrow?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * THE context menu — the prototype's 200px panel at the invocation point
 * (9px radius, --t-bd6 hairline, 4px padding, rises 120ms).
 *
 * Full keyboard menu semantics live here: arrow navigation that skips disabled
 * items, Enter/Space to activate, Escape to dismiss, and pointer-down-outside.
 */
export function ContextMenu({
  open,
  x,
  y,
  items,
  label = 'Actions',
  eyebrow,
  onSelect,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (open) setActiveIndex(-1);
  }, [open, x, y]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const menu = menuRef.current;
      if (menu && !menu.contains(event.target as Node)) onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) menuRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function step(from: number, delta: number): number {
    const count = items.length;
    if (count === 0) return -1;
    let next = from;
    // Skip disabled entries; give up after a full lap so an all-disabled menu
    // cannot spin forever.
    for (let hops = 0; hops < count; hops += 1) {
      next = (next + delta + count) % count;
      if (!items[next]?.disabled) return next;
    }
    return from;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => step(i, event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const item = items[activeIndex];
      if (!item || item.disabled) return;
      event.preventDefault();
      onSelect(item.id);
      onClose();
    }
  }

  return (
    <div
      ref={menuRef}
      className="kit-contextmenu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      style={{ left: `${x}px`, top: `${y}px` }}
      onKeyDown={onKeyDown}
    >
      {eyebrow ? <div className="kit-contextmenu__eyebrow">{eyebrow}</div> : null}
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          aria-label={item.ariaLabel}
          className="kit-contextmenu__item"
          data-tone={item.tone === 'danger' ? 'danger' : undefined}
          data-active={index === activeIndex ? 'true' : undefined}
          data-description={item.description ? 'true' : undefined}
          disabled={item.disabled}
          title={item.title}
          onClick={() => {
            onSelect(item.id);
            onClose();
          }}
        >
          {item.icon ? <span className="kit-contextmenu__icon">{item.icon}</span> : null}
          <span className="kit-contextmenu__copy">
            <span className="kit-contextmenu__label">{item.label}</span>
            {item.description ? (
              <span className="kit-contextmenu__description">{item.description}</span>
            ) : null}
          </span>
          {item.checked ? (
            <span className="kit-contextmenu__check" data-checked="true">
              <Icon name="check" />
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
