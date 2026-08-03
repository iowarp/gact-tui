import type { ReactNode } from 'react';
import './toolbarbutton.css';

export interface ToolbarButtonProps {
  /** Always required — it is the accessible name, icon-only or not. */
  label: string;
  icon?: ReactNode;
  /** Hide the text and keep only the icon; the name survives via aria-label. */
  iconOnly?: boolean;
  /** Renders as a toggle and reports aria-pressed. */
  pressed?: boolean;
  onClick: () => void;
}

/**
 * The header/toolbar control — `files`, `console`, `artifacts 5`, `ctx 41%`,
 * the observability eye.
 *
 * Geometry from the prototype: transparent with a transparent 1px border
 * (so hover can reveal one without shifting layout), 3px/8px padding, 5px
 * radius, mono 11.5px, muted.
 *
 * `label` is mandatory precisely because several of these are icon-only in the
 * prototype; that is exactly where an accessible name is usually dropped.
 */
export function ToolbarButton({
  label,
  icon,
  iconOnly = false,
  pressed,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="kit-toolbarbutton"
      data-icon-only={iconOnly ? 'true' : undefined}
      aria-label={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      onClick={onClick}
    >
      {icon ? (
        <span className="kit-toolbarbutton__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {iconOnly ? null : <span className="kit-toolbarbutton__label">{label}</span>}
    </button>
  );
}
